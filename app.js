const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CFG = window.POLO_CONFIG || {};

const DEFAULTS = {
  prefix: '!',
  presence: '/help - polo.gg',
  lang: 'es',
  automod: true,
  audit: true,
  apiUrl: CFG.apiUrl || '',
  clientId: CFG.clientId || '',
  redirectUri: CFG.redirectUri || (window.location.origin + window.location.pathname),
  inviteUrl: CFG.inviteUrl || '',
  supportServer: CFG.supportServer || '',
  docsUrl: CFG.docsUrl || '',
  disabledCmds: [],
  servers: [],
  commands: [
    { name: 'ban', cat: 'mod', desc: 'Banea a un usuario con motivo y DM.' },
    { name: 'kick', cat: 'mod', desc: 'Expulsa con advertencia previa.' },
    { name: 'clear', cat: 'mod', desc: 'Borra 1-100 mensajes del canal.' },
    { name: 'warn', cat: 'mod', desc: 'Sistema de warns acumulables.' },
    { name: 'poll', cat: 'fun', desc: 'Crea encuestas con reacciones.' },
    { name: 'meme', cat: 'fun', desc: 'Meme random.' },
    { name: '8ball', cat: 'fun', desc: 'Bola magica de PoLo.' },
    { name: 'play', cat: 'music', desc: 'Reproduce YouTube / Spotify.' },
    { name: 'skip', cat: 'music', desc: 'Salta la cancion actual.' },
    { name: 'queue', cat: 'music', desc: 'Muestra la cola de reproduccion.' },
    { name: 'avatar', cat: 'util', desc: 'Muestra avatar en HD.' },
    { name: 'serverinfo', cat: 'util', desc: 'Info completa del servidor.' }
  ]
};

let S = null;
try {
  S = JSON.parse(localStorage.getItem('polo_state') || 'null') || structuredClone(DEFAULTS);
} catch { S = structuredClone(DEFAULTS); }
const save = () => localStorage.setItem('polo_state', JSON.stringify(S));

let stats = { totalCmds: 0, online: null };

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

function gotoSettings() { document.querySelector('[data-view="settings"]').click(); }

// ---------- API ----------
function apiBase() { return (S.apiUrl || '').replace(/\/$/, ''); }
function authHeaders() {
  const sess = getSession();
  const h = { 'Content-Type': 'application/json' };
  if (sess && sess.token) h['Authorization'] = 'Bearer ' + sess.token;
  return h;
}
async function apiGet(path) {
  const base = apiBase();
  if (!base) throw new Error('no-api');
  const r = await fetch(base + path, { headers: authHeaders() });
  if (!r.ok) throw new Error('http-' + r.status);
  return r.json();
}
async function apiPost(path, body) {
  const base = apiBase();
  if (!base) throw new Error('no-api');
  const r = await fetch(base + path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body || {}) });
  if (!r.ok) throw new Error('http-' + r.status);
  return r.json().catch(() => ({}));
}

// ---------- AUTH ----------
function getRedirect() { return S.redirectUri || CFG.redirectUri || (window.location.origin + window.location.pathname); }
function getLoginUrl() {
  const cid = S.clientId;
  if (!cid || cid === 'TU_CLIENT_ID') return '';
  const redirect = encodeURIComponent(getRedirect());
  return `https://discord.com/oauth2/authorize?client_id=${cid}&redirect_uri=${redirect}&response_type=code&scope=identify%20guilds`;
}
function getSession() {
  try { return JSON.parse(localStorage.getItem('polo_session') || 'null'); }
  catch { return null; }
}
function setSession(s) {
  if (s) localStorage.setItem('polo_session', JSON.stringify(s));
  else localStorage.removeItem('polo_session');
}
function renderUser() {
  const sess = getSession();
  const gate = $('#loginGate');
  if (!sess) {
    gate.classList.remove('hidden');
    $('#userName').textContent = 'Sin sesion';
    $('#userSub').textContent = 'invitado';
    $('#userAvatar').textContent = '--';
    $('#authBtn').textContent = 'Entrar';
    $('#loginTag').textContent = 'sin sesion';
    $('#heroName').textContent = 'admin de PoLo';
    if (S.servers.length) { S.servers = []; save(); renderServers(); renderHero(); }
    return;
  }
  gate.classList.add('hidden');
  $('#userName').textContent = sess.username || 'Usuario';
  $('#heroName').textContent = sess.username || 'Usuario';
  $('#userSub').textContent = 'discord conectado';
  $('#userAvatar').textContent = (sess.username || 'U').slice(0, 2).toUpperCase();
  if (sess.avatar) $('#userAvatar').innerHTML = `<img src="${sess.avatar}" alt="avatar" />`;
  $('#authBtn').textContent = 'Salir';
  $('#loginTag').textContent = 'discord conectado';
}
function doLogin() {
  const url = getLoginUrl();
  if (!url) { toast('Pega tu Client ID en Ajustes primero'); gotoSettings(); return; }
  window.location.href = url;
}
function doLogout() {
  setSession(null);
  S.servers = [];
  ME = { isOwner: false, isPremium: false, id: null };
  SELECTED_GUILD = null;
  save();
  renderUser();
  renderServers();
  renderHero();
  showNoGuild();
  paintPremiumLock();
  $('#staffQueue').classList.add('hidden');
  toast('Sesion cerrada');
}
async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const err = params.get('error');
  if (err) { toast('Login cancelado'); return; }
  if (!code) return;
  window.history.replaceState({}, '', window.location.pathname);
  if (!apiBase()) {
    toast('Falta API URL. Configurala en Ajustes');
    $('#apiMsg').textContent = 'Se recibio el code de Discord pero no hay API URL para intercambiarlo.';
    gotoSettings();
    return;
  }
  try {
    const j = await apiPost('/auth/exchange', { code, redirect_uri: getRedirect() });
    const prev = getSession();
    if (!prev || prev.id !== j.id) {
      // Cuenta distinta: borra servidores cacheados de la otra cuenta
      S.servers = [];
      SELECTED_GUILD = null;
    }
    setSession({
      username: j.username || j.global_name || 'Usuario',
      id: j.id || '',
      avatar: (j.id && j.avatar) ? `https://cdn.discordapp.com/avatars/${j.id}/${j.avatar}.png` : null,
      token: j.sessionToken || j.token || null
    });
    renderUser();
    await loadRealData();
    toast('Login con Discord correcto');
  } catch {
    toast('No se pudo iniciar sesión, intenta de nuevo');
    $('#apiMsg').textContent = 'No se pudo completar el acceso. Revisa la URL de conexión.';
  }
}

// ---------- LINKS ----------
function getInviteUrl() {
  if (S.inviteUrl) return S.inviteUrl;
  if (S.clientId && S.clientId !== 'TU_CLIENT_ID') {
    return `https://discord.com/oauth2/authorize?client_id=${S.clientId}&scope=bot+applications.commands&permissions=8`;
  }
  return '';
}
function openLink(url, fallbackMsg) {
  if (!url) { toast(fallbackMsg); gotoSettings(); return; }
  window.open(url, '_blank');
}

// ---------- NAV ----------
$('#mainNav').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('#mainNav button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + b.dataset.view).classList.add('active');
  $('#sidebar').classList.remove('open');
  $('#scrim').classList.remove('open');
});
$$('[data-goto]').forEach(b => b.addEventListener('click', () => document.querySelector(`[data-view="${b.dataset.goto}"]`).click()));
$('#menuBtn').onclick = () => { $('#sidebar').classList.add('open'); $('#scrim').classList.add('open'); };
$('#scrim').onclick = () => { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('open'); };

// ---------- STATUS + HERO ----------
function renderStatus() {
  const online = stats.online !== false;
  $('#statusPill').classList.toggle('off', !online);
  $('#statusPill').innerHTML = `<i></i> ${online ? 'En linea' : 'Pausado'}`;
  $('#sideDot').classList.toggle('off', !online);
  $('#heroStatus').textContent = online ? 'En linea' : 'Pausado';
}
function setText(id, val) { $(id).textContent = (val ?? '--').toLocaleString ? val.toLocaleString() : val; }
function renderHero() {
  const withPolo = S.servers.filter(s => s.hasPolo !== false);
  const users = withPolo.reduce((a, s) => a + (s.members || 0), 0);
  $('#statServers').textContent = withPolo.length ? withPolo.length.toLocaleString() : '0';
  $('#statUsers').textContent = users ? users.toLocaleString() : '0';
  $('#statCmds').textContent = stats.totalCmds ? stats.totalCmds.toLocaleString() : '0';
  $('#navServerCount').textContent = withPolo.length;
  $('#serverCountLabel').textContent = `- ${withPolo.length} con PoLo`;
}

// ---------- TEMA UNICO OSCURO DISCORD ----------

// ---------- FEED ----------
function renderFeed(items) {
  if (!items || !items.length) {
    $('#feed').innerHTML = '<p class="muted">Sin eventos. Conecta tu bot para ver actividad.</p>';
    return;
  }
  $('#feed').innerHTML = items.map(e => `<div class="feed-item"><span class="tag">${e.tag || 'INFO'}</span><span>${e.text}</span></div>`).join('');
}

// ---------- SERVERS ----------
function guildIcon(s, size) {
  if (s.icon) return `https://cdn.discordapp.com/icons/${s.id}/${s.icon}.png?size=${size || 64}`;
  return '';
}
function guildAvatar(s) {
  const url = guildIcon(s);
  const letter = (s.name || 'S')[0].toUpperCase();
  if (url) return `<img src="${url}" alt="" loading="lazy" onerror="this.outerHTML='${letter}'" />`;
  return letter;
}
function renderServers(filter = '') {
  const onlyPolo = $('#onlyPolo') ? $('#onlyPolo').checked : true;
  let list = S.servers.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));
  if (onlyPolo) list = list.filter(s => s.hasPolo);
  const withPolo = S.servers.filter(s => s.hasPolo).length;
  $('#navServerCount').textContent = withPolo;
  $('#serverCountLabel').textContent = `- ${list.length} con PoLo`;
  $('#serverSubtitle').textContent = S.servers.length
    ? `Solo ves servidores donde eres admin. ${S.servers.length} controlables, ${withPolo} con PoLo instalado.`
    : 'Inicia sesion y conecta tu bot para cargar tus servidores.';
  // Selector de servidor a moderar (solo con PoLo)
  const sel = $('#guildSelect');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Selecciona servidor...</option>' +
    S.servers.filter(s => s.hasPolo).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  if (cur && S.servers.some(s => s.id === cur && s.hasPolo)) sel.value = cur;
  // Mini-lista Servers bajo la marca
  $('#sideGuildCount').textContent = S.servers.length;
  $('#sideGuilds').innerHTML = S.servers.slice(0, 12).map(s =>
    `<div class="side-guild ${s.hasPolo ? '' : 'no-polo'} ${s.id === SELECTED_GUILD ? 'sel' : ''}" title="${s.name}${s.hasPolo ? '' : ' (sin PoLo)'}" data-side="${s.id}">${guildAvatar(s)}</div>`
  ).join('') || '<span class="muted" style="font-size:12px">Sin servidores</span>';
  $$('#sideGuilds [data-side]').forEach(d => d.onclick = () => {
    const s = S.servers.find(x => x.id === d.dataset.side);
    if (s && s.hasPolo) selectGuild(s.id, true);
    else if (s) inviteTo(s.id);
  });
  if (!S.servers.length) {
    $('#serverGrid').innerHTML = '<p class="muted">Sin datos. Pulsa Sincronizar.</p>';
    return;
  }
  $('#serverGrid').innerHTML = list.map(s => `
    <div class="server">
      <div class="server-top"><div class="s-icon">${guildAvatar(s)}</div>
      <div><strong>${s.name}${s.isOwner ? ' 👑' : ''}</strong><span>${(s.members || 0).toLocaleString()} miembros</span></div></div>
      <div class="s-meta"><span class="tag green">PoLo dentro</span><span>${S.prefix}help</span></div>
      <div class="s-actions"><button class="btn-ghost" data-manage="${s.id}">Gestionar</button></div>
    </div>`).join('') || '<p class="muted">Ningun servidor coincide con el filtro.</p>';
  const missing = S.servers.filter(s => !s.hasPolo && s.name.toLowerCase().includes(filter.toLowerCase()));
  if (missing.length && !onlyPolo) {
    $('#serverGrid').innerHTML += missing.map(s => `
    <div class="server" style="opacity:.9">
      <div class="server-top"><div class="s-icon no-polo">${guildAvatar(s)}</div>
      <div><strong>${s.name}</strong><span>sin PoLo</span></div></div>
      <div class="s-meta"><span class="tag">Sin PoLo</span></div>
      <div class="s-actions"><button class="btn-primary" onclick="inviteTo('${s.id}')">Anadir PoLo</button></div>
    </div>`).join('');
  }
  $$('#serverGrid [data-manage]').forEach(b => b.onclick = () => selectGuild(b.dataset.manage, true));
}

let ME = { isOwner: false, isPremium: false, id: null };
let SELECTED_GUILD = null;
function selectGuild(id, goto) {
  SELECTED_GUILD = id;
  $('#guildSelect').value = id;
  const s = S.servers.find(x => x.id === id);
  $('#guildTitle').textContent = s ? s.name : 'Servidor';
  if (!id) { showNoGuild(); }
  if (id) {
    loadGuildConfig(id);
    if (pendingModule) { const p = pendingModule; pendingModule = null; openModule(p); }
    else openModule(currentModule || 'welcome');
  }
  if (goto) document.querySelector('[data-view="guild"]').click();
}
$('#guildSelect').onchange = e => { if (e.target.value) selectGuild(e.target.value, true); };

async function refreshMe() {
  try {
    const j = await apiGet('/api/me');
    ME = { isOwner: !!j.isOwner, isPremium: !!j.isPremium, id: j.id };
  } catch { ME = { isOwner: false, isPremium: false, id: null }; }
  paintPremiumLock();
  try {
    const s = await apiGet('/api/staff');
    $('#staffQueue').classList.toggle('hidden', !s.isStaff);
  } catch { $('#staffQueue').classList.add('hidden'); }
}

// ---------- MODULOS: hub estilo Koya + detalle ----------
let currentModule = null;
let pendingModule = null;
function openModule(name) {
  const panel = $('#gtab-' + name);
  if (!panel) return;
  currentModule = name;
  $('#noGuildBox').classList.add('hidden');
  $$('#guildPanelsHost .gpanel').forEach(p => p.classList.remove('active'));
  panel.classList.add('active');
  $$('#sideMods button').forEach(b => b.classList.toggle('on', b.dataset.gtab === name));
}
function showNoGuild() {
  currentModule = null;
  $$('#guildPanelsHost .gpanel').forEach(p => p.classList.remove('active'));
  $('#noGuildBox').classList.remove('hidden');
  $$('#sideMods button').forEach(b => b.classList.remove('on'));
}
function gotoModule(name) {
  document.querySelector('[data-view="guild"]').click();
  if (!SELECTED_GUILD) {
    pendingModule = name;
    showNoGuild();
    toast('Elige un servidor para configurar');
    return;
  }
  openModule(name);
}
$('#sideMods').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) gotoModule(b.dataset.gtab);
});
let aiOn = true;
$('#aiEnabled').onclick = e => { aiOn = !aiOn; e.target.classList.toggle('on', aiOn); };
let secOn = { enabled: false, links: false, spam: false, phish: false };
function bindSwitch(id, get, set) {
  $(id).onclick = e => { set(!get()); e.target.classList.toggle('on', get()); };
}
bindSwitch('#secEnabled', () => secOn.enabled, v => secOn.enabled = v);
bindSwitch('#secLinks', () => secOn.links, v => secOn.links = v);
bindSwitch('#secSpam', () => secOn.spam, v => secOn.spam = v);
bindSwitch('#secPhish', () => secOn.phish, v => secOn.phish = v);
function paintSwitches() {
  $('#secEnabled').classList.toggle('on', secOn.enabled);
  $('#secLinks').classList.toggle('on', secOn.links);
  $('#secSpam').classList.toggle('on', secOn.spam);
  $('#secPhish').classList.toggle('on', secOn.phish);
}
async function loadGuildConfig(id) {
  try {
    const j = await apiGet('/api/guilds/' + id + '/config');
    $('#wChannel').value = j.welcome?.channelId || '';
    $('#wMsg').value = j.welcome?.mensaje || '';
    $('#lChannel').value = j.levels?.levelChannel || '';
    $('#lMsg').value = j.levels?.mensaje || '';
    aiOn = j.ai?.enabled !== false;
    $('#aiEnabled').classList.toggle('on', aiOn);
    $('#aiPrompt').value = j.ai?.prompt || '';
    const s = j.security || {};
    secOn = {
      enabled: s.enabled === true,
      links: s.antiLinks?.enabled === true,
      spam: s.antiSpam?.enabled === true || s.enabled === true,
      phish: s.antiPhishing?.enabled === true,
    };
    paintSwitches();
    $('#secLog').value = s.logChannelId || '';
    $('#tkTitle').value = j.tickets?.panelTitle || '';
    $('#tkDesc').value = j.tickets?.panelDesc || '';
    $('#tkChannel').value = j.tickets?.panelChannelId || '';
    $('#tkRoles').value = (j.tickets?.staffRoles || []).join(', ');
    $('#ecoCooldown').value = j.economy?.workCooldownSeconds ?? '';
    $('#ecoMax').value = j.economy?.workMax ?? '';
    $('#ecoChannel').value = j.economy?.economyChannelId || '';
    $('#jrRoles').value = (j.joinroles || []).join(', ');
    $('#lgChannel').value = j.logs?.logChannel || '';
    $('#lgLevel').value = j.logs?.logLevel ?? '';
    $('#mlChannel').value = j.modlog?.channelId || '';
    $('#ctChannel').value = j.counter?.channelId || '';
    $('#ivChannel').value = j.invites?.channelId || '';
    bpOn = !!j.bump?.activo;
    $('#bpActive').classList.toggle('on', bpOn);
    $('#bpChannel').value = j.bump?.canalId || '';
    $('#bpMsg').value = j.bump?.mensaje || '';
    $('#wPreview').innerHTML = j.welcomeImage
      ? `<img src="${j.welcomeImage}" alt="fondo bienvenida" />`
      : (j.hasWelcomeImage ? '<p class="muted">Hay imagen guardada (muy pesada para vista previa).</p>' : '');
    $('#wImage').value = '';
    renderYt(j.youtube || []);
  } catch { toast('No se pudo cargar la config del servidor'); }
}
let ytCache = [];
let ytEditing = null;
function renderYt(list) {
  ytCache = list;
  $('#ytList').innerHTML = list.map((a, i) =>
    `<div class="feed-item"><span class="tag">YT</span><span><b>${a.youtubeChannelTitle || a.youtubeChannelId}</b><br><small style="color:#949ba4">avisa en <#${a.announceChannelId}></small></span><span style="margin-left:auto;display:flex;gap:6px"><button class="btn-ghost" style="padding:6px 10px" data-yte="${i}">Editar</button><button class="btn-ghost" style="padding:6px 10px" data-yt="${a.youtubeChannelId}">Quitar</button></span></div>`
  ).join('') || '<p class="muted">Sin alertas. Añade la primera abajo.</p>';
  $$('#ytList [data-yt]').forEach(b => b.onclick = async () => {
    await saveGuildSection('youtube_remove', { youtubeChannelId: b.dataset.yt });
    ytEditing = null;
    $('#ytAdd').textContent = 'Añadir alerta';
    if (SELECTED_GUILD) loadGuildConfig(SELECTED_GUILD);
  });
  $$('#ytList [data-yte]').forEach(b => b.onclick = () => {
    const a = ytCache[Number(b.dataset.yte)];
    if (!a) return;
    ytEditing = a.youtubeChannelId;
    $('#ytChannel').value = a.youtubeChannelId || '';
    $('#ytName').value = a.youtubeChannelTitle || '';
    $('#ytAnnounce').value = a.announceChannelId || '';
    $('#ytRole').value = a.mentionRoleId || '';
    $('#ytMsg').value = a.message || '';
    $('#ytAdd').textContent = 'Guardar cambios';
    $('#ytChannel').focus();
  });
}
let bpOn = false;
$('#bpActive').onclick = e => { bpOn = !bpOn; e.target.classList.toggle('on', bpOn); };
$('#jrSave').onclick = () => saveGuildSection('joinroles', { roleIds: $('#jrRoles').value });
$('#lgSave').onclick = async () => {
  await saveGuildSection('logs', { logChannel: $('#lgChannel').value, logLevel: $('#lgLevel').value });
  await saveGuildSection('modlog', { channelId: $('#mlChannel').value });
};
$('#ctSave').onclick = () => saveGuildSection('counter', { channelId: $('#ctChannel').value });
$('#ivSave').onclick = () => saveGuildSection('invites', { channelId: $('#ivChannel').value });
$('#secSave').onclick = () => saveGuildSection('security', {
  enabled: secOn.enabled,
  antiLinks: { enabled: secOn.links },
  antiSpam: { enabled: secOn.spam },
  antiPhishing: { enabled: secOn.phish },
  logChannelId: $('#secLog').value.trim() || null,
});
$('#tkSave').onclick = () => saveGuildSection('tickets', {
  panelTitle: $('#tkTitle').value,
  panelDesc: $('#tkDesc').value,
  panelChannelId: $('#tkChannel').value,
  staffRoles: $('#tkRoles').value.split(',').map(x => x.trim()).filter(Boolean),
});
$('#tkSend').onclick = async () => {
  if (!SELECTED_GUILD) { toast('Selecciona un servidor primero'); return; }
  await saveGuildSection('tickets', {
    panelTitle: $('#tkTitle').value,
    panelDesc: $('#tkDesc').value,
    panelChannelId: $('#tkChannel').value,
    staffRoles: $('#tkRoles').value.split(',').map(x => x.trim()).filter(Boolean),
  });
  try {
    await apiPost('/api/guilds/' + SELECTED_GUILD + '/config', { section: 'tickets_send', data: { panelChannelId: $('#tkChannel').value } });
    toast('Panel publicado en el canal');
  } catch { toast('No se pudo publicar. Revisa el canal y permisos'); }
};
$('#ecoSave').onclick = () => saveGuildSection('economy', {
  workCooldownSeconds: $('#ecoCooldown').value,
  workMax: $('#ecoMax').value,
  economyChannelId: $('#ecoChannel').value.trim() || null,
});
$('#ytAdd').onclick = async () => {
  const data = {
    youtubeChannelId: $('#ytChannel').value.trim(),
    youtubeChannelTitle: $('#ytName').value.trim(),
    announceChannelId: $('#ytAnnounce').value.trim(),
    mentionRoleId: $('#ytRole').value.trim(),
    message: $('#ytMsg').value,
  };
  if (!data.youtubeChannelId || !data.announceChannelId) { toast('Faltan IDs de canal'); return; }
  if (ytEditing && ytEditing !== data.youtubeChannelId) {
    await saveGuildSection('youtube_remove', { youtubeChannelId: ytEditing });
  }
  if (ytEditing) await saveGuildSection('youtube_remove', { youtubeChannelId: data.youtubeChannelId });
  await saveGuildSection('youtube_add', data);
  ytEditing = null;
  $('#ytAdd').textContent = 'Añadir alerta';
  $('#ytChannel').value = $('#ytName').value = $('#ytAnnounce').value = $('#ytRole').value = $('#ytMsg').value = '';
  if (SELECTED_GUILD) loadGuildConfig(SELECTED_GUILD);
};
async function saveGuildSection(section, data) {
  if (!SELECTED_GUILD) { toast('Selecciona un servidor primero'); return; }
  try {
    await apiPost('/api/guilds/' + SELECTED_GUILD + '/config', { section, data });
    toast('Guardado en el bot');
  } catch (e) {
    toast('Sin permiso o sin conexion (IA personalizada = premium)');
  }
}
$('#wSave').onclick = async () => {
  await saveGuildSection('welcome', { channelId: $('#wChannel').value.trim(), mensaje: $('#wMsg').value });
  const f = $('#wImage').files[0];
  if (f) {
    if (f.size > 5 * 1024 * 1024) { toast('Imagen muy pesada (max 5MB)'); return; }
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
    await saveGuildSection('welcome_image', { image: dataUrl });
    if (SELECTED_GUILD) loadGuildConfig(SELECTED_GUILD);
  }
};
$('#lSave').onclick = () => saveGuildSection('levels', { levelChannel: $('#lChannel').value.trim(), mensaje: $('#lMsg').value });
$('#aiSave').onclick = () => saveGuildSection('ai', { enabled: aiOn, prompt: $('#aiPrompt').value });

// ---------- BUG REPORTS ----------
$('#bugForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const r = await apiPost('/api/reports', {
      bug: $('#bugText').value,
      severity: $('#bugSev').value,
      note: $('#bugNote').value,
      guildId: SELECTED_GUILD,
      guildName: (S.servers.find(s => s.id === SELECTED_GUILD) || {}).name || 'dashboard',
    });
    toast('Reporte #' + (r.id || '?') + ' enviado');
    e.target.reset();
  } catch { toast('No se pudo enviar el reporte'); }
});

// ---------- MINI CHAT IA ----------
const aiHist = [];
function aiMsg(role, text) {
  $('#aiBody').insertAdjacentHTML('beforeend', `<div class="ai-msg ${role}">${text.replace(/</g, '&lt;')}</div>`);
  $('#aiBody').scrollTop = $('#aiBody').scrollHeight;
}
$('#aiFab').onclick = () => {
  $('#aiChat').classList.toggle('open');
  if ($('#aiChat').classList.contains('open') && !aiHist.length) aiMsg('bot', 'Hola! Soy PoLo. Preguntame como usar el dashboard o configurar tu servidor.');
};
$('#aiClose').onclick = () => $('#aiChat').classList.remove('open');
$('#aiForm').addEventListener('submit', async e => {
  e.preventDefault();
  const v = $('#aiInput').value.trim();
  if (!v) return;
  $('#aiInput').value = '';
  aiMsg('user', v);
  aiHist.push({ role: 'user', content: v });
  $('#aiBody').insertAdjacentHTML('beforeend', '<div class="ai-msg bot typing" id="aiTyping">PoLo está escribiendo...</div>');
  $('#aiBody').scrollTop = $('#aiBody').scrollHeight;
  try {
    const r = await apiPost('/api/ai/chat', { message: v, guildId: SELECTED_GUILD, history: aiHist.slice(-8) });
    $('#aiTyping')?.remove();
    aiMsg('bot', r.reply || '...');
    aiHist.push({ role: 'assistant', content: r.reply || '' });
  } catch { $('#aiTyping')?.remove(); aiMsg('bot', 'No pude responder. Intenta de nuevo.'); }
});

// ---------- AYUDA: comandos reales del bot ----------
let helpCat = 'all';
let realCmds = [];
async function loadHelp() {
  try {
    const j = await apiGet('/api/commands');
    realCmds = j.commands || [];
  } catch { realCmds = []; }
  renderHelp($('#helpSearch').value);
}
function renderHelp(filter = '') {
  const list = (realCmds.length ? realCmds : S.commands.map(c => ({ ...c, desc: c.desc })))
    .filter(c => (helpCat === 'all' || c.cat === helpCat) && (c.name + ' ' + (c.desc || '')).toLowerCase().includes(filter.toLowerCase()));
  $('#helpCount').textContent = `- ${list.length}`;
  $('#helpGrid').innerHTML = list.map(c =>
    `<div class="cmd"><div class="cmd-top"><code>/${c.name}</code><span class="tag">${c.cat}</span></div><p>${c.desc || 'Sin descripción.'}</p></div>`
  ).join('') || '<p class="muted">Ningún comando coincide.</p>';
}
$('#helpChips').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  $$('#helpChips .chip').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  helpCat = b.dataset.cat;
  renderHelp($('#helpSearch').value);
});
$('#helpSearch').addEventListener('input', e => renderHelp(e.target.value));
window.inviteTo = (id) => {
  const url = getInviteUrl();
  if (!url) { toast('Configura Client ID primero'); gotoSettings(); return; }
  window.open(url + '&guild_id=' + id, '_blank');
};
$('#serverSearch').addEventListener('input', e => renderServers(e.target.value));
$('#onlyPolo').addEventListener('change', () => renderServers($('#serverSearch').value));
$('#refreshServers').onclick = async () => {
  try { await loadRealData(); toast('Sincronizado'); }
  catch { toast('Sin conexion. Revisa API URL'); }
};

// ---------- CONSOLE (eliminada: registro interno sin UI) ----------
function log() {}

// ---------- MODERATION ----------
function renderReports(items) {
  if (!items || !items.length) {
    $('#reports').innerHTML = '<p class="muted">Sin reportes.</p>';
    $('#repCount').textContent = '0 pendientes';
    return;
  }
  $('#reports').innerHTML = items.map(r => `<div class="feed-item"><span class="tag">REPORT</span><span><b>${r.user}</b> - ${r.reason}<br><small style="color:#949ba4">${r.guild} - ${r.severity}</small></span></div>`).join('');
  $('#repCount').textContent = items.length + ' pendientes';
}

// ---------- SETTINGS ----------
function loadSettings() {
  $('#setLang').value = S.lang;
  $('#setAutomod').classList.toggle('on', S.automod);
  $('#setAudit').classList.toggle('on', S.audit);
  $('#setClientId').value = S.clientId || '';
  $('#setRedirect').value = getRedirect();
  $('#setInvite').value = S.inviteUrl || '';
  $('#setSupport').value = S.supportServer || '';
  $('#setDocs').value = S.docsUrl || '';
  $('#apiUrl').value = S.apiUrl || '';
  $('#redirectHint').textContent = getRedirect();
}
[['setAutomod', 'automod'], ['setAudit', 'audit']].forEach(([id, k]) => {
  $('#' + id).onclick = (e) => { S[k] = !S[k]; e.target.classList.toggle('on', S[k]); save(); };
});
$('#settingsForm').addEventListener('submit', async e => {
  e.preventDefault();
  S.lang = $('#setLang').value;
  S.clientId = $('#setClientId').value.trim();
  S.redirectUri = $('#setRedirect').value.trim();
  S.inviteUrl = $('#setInvite').value.trim();
  S.supportServer = $('#setSupport').value.trim();
  S.docsUrl = $('#setDocs').value.trim();
  S.apiUrl = $('#apiUrl').value.trim();
  save();
  try { await apiPost('/api/settings', { lang: S.lang, automod: S.automod, audit: S.audit }); toast('Configuracion guardada'); }
  catch { toast('Guardado local. Sin conexion al bot'); }
  renderHero();
});
// ---------- BLOQUEO PREMIUM ----------
function paintPremiumLock() {
  const locked = !ME.isPremium;
  $('#aiGate').textContent = ME.isPremium ? 'desbloqueado' : 'PoLo+';
  $('#aiLock').classList.toggle('hidden', !locked);
  $('#aiPrompt').disabled = locked;
  $('#aiSave').disabled = locked;
}
$('#editPresence')?.remove();
$('#testApi').onclick = async () => {
  const url = $('#apiUrl').value.trim();
  if (!url) { $('#apiMsg').textContent = 'Pon una URL primero (ej. http://localhost:3000)'; return; }
  $('#apiMsg').textContent = 'Conectando...';
  try {
    const r = await fetch(url + '/api/stats');
    if (!r.ok) throw 0;
    const j = await r.json();
    $('#apiMsg').textContent = 'Conectado: ' + JSON.stringify(j).slice(0, 140);
    S.apiUrl = url;
    save();
    await loadRealData();
  } catch {
    $('#apiMsg').textContent = 'No se pudo conectar. Revisa la URL.';
  }
};
$('#copyInvite').onclick = () => {
  const url = $('#setInvite').value.trim() || getInviteUrl();
  if (!url) { toast('Pega tu Client ID primero'); return; }
  navigator.clipboard?.writeText(url);
  toast('URL de invitacion copiada');
};

$('#inviteBtn').onclick = () => openLink(getInviteUrl(), 'Configura tu Client ID en Ajustes');
$('#openInviteTop').onclick = () => openLink(getInviteUrl(), 'Configura tu Client ID en Ajustes');
$('#supportBtn').onclick = () => openLink(S.supportServer || CFG.supportServer, 'Configura tu servidor de soporte en Ajustes');
$('#docsBtn').onclick = () => window.open('docs.html', '_blank');
// ---------- SELECTOR DE CANALES (modal, sin IDs) ----------
let chanTarget = null;
async function openChanPicker(inputId) {
  if (!SELECTED_GUILD) { toast('Selecciona un servidor primero'); return; }
  chanTarget = inputId;
  $('#chanList').innerHTML = '<p class="muted">Cargando canales...</p>';
  $('#chanModal').classList.remove('hidden');
  try {
    const j = await apiGet('/api/guilds/' + SELECTED_GUILD + '/channels');
    const list = j.channels || [];
    $('#chanList').innerHTML = list.map(c =>
      `<button class="chan-row" data-ch="${c.id}" data-nm="${c.name}"># ${c.name}</button>`
    ).join('') || '<p class="muted">Sin canales. ¿PoLo está en el servidor?</p>';
    $$('#chanList [data-ch]').forEach(b => b.onclick = () => {
      document.getElementById(chanTarget).value = b.dataset.ch;
      $('#chanModal').classList.add('hidden');
      toast('#' + b.dataset.nm + ' seleccionado');
    });
  } catch { $('#chanList').innerHTML = '<p class="muted">No se pudieron cargar los canales.</p>'; }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pick]');
  if (b) openChanPicker(b.dataset.pick);
});
$('#chanClose').onclick = () => $('#chanModal').classList.add('hidden');
$('#chanModal').addEventListener('click', e => { if (e.target.id === 'chanModal') e.target.classList.add('hidden'); });
$('#discordLoginBtn').onclick = doLogin;
$('#loginTestBtn').onclick = () => {
  S.clientId = $('#setClientId').value.trim();
  S.redirectUri = $('#setRedirect').value.trim();
  save();
  doLogin();
};
$('#logoutBtn').onclick = doLogout;
$('#authBtn').onclick = () => { getSession() ? doLogout() : $('#loginGate').classList.remove('hidden'); };
$('#resetBtn').onclick = () => { if (confirm('Borrar config local?')) { localStorage.removeItem('polo_state'); localStorage.removeItem('polo_session'); location.reload(); } };

// ---------- LOAD REAL ----------
async function loadStats() {
  const j = await apiGet('/api/stats');
  stats = {
    ping: j.ping ?? null,
    ram: j.ram ?? null,
    cpu: j.cpu ?? null,
    cpm: j.commandsPerMin ?? null,
    totalCmds: j.totalCmds ?? 0,
    uptime: j.uptime || null,
    online: j.online !== false
  };
  if (j.prefix) S.prefix = j.prefix;
  if (j.presence) S.presence = j.presence;
  save();
  renderStatus();
  renderHero();
}
async function loadGuilds() {
  try {
    const j = await apiGet('/api/guilds');
    const arr = Array.isArray(j) ? j : (j.guilds || []);
  S.servers = arr.map((g, i) => ({
    id: String(g.id || i),
    name: g.name || 'Sin nombre',
    members: g.memberCount ?? g.members ?? 0,
    color: g.icon ? '#2f7fe0' : '#2f7fe0',
    hasPolo: g.hasPolo !== false,
    isOwner: !!g.isOwner,
    icon: g.icon || null,
  }));
  save();
  renderServers($('#serverSearch').value);
  renderHero();
  } catch {
    // Token invalido o sin conexion: no muestres servidores de otra cuenta
    S.servers = [];
    save();
    renderServers('');
    renderHero();
  }
}
async function loadActivity() {
  try {
    const j = await apiGet('/api/activity');
    renderFeed(j.events || []);
  } catch { /* sin datos */ }
}
async function loadReports() {
  try {
    const j = await apiGet('/api/reports');
    renderReports(Array.isArray(j) ? j : (j.reports || []));
  } catch { renderReports([]); }
}
async function loadRealData() {
  await refreshMe().catch(() => {});
  await loadStats();
  await loadGuilds();
  await loadActivity();
  await loadReports();
  await loadHelp().catch(() => {});
}
setInterval(() => { if (apiBase() && getSession()) loadStats().catch(() => {}); }, 15000);

// ---------- MISC ----------

// ---------- INIT ----------
renderStatus();
renderHero();
renderFeed([]);
renderServers();
renderReports([]);
loadSettings();
renderUser();
refreshMe();
handleOAuthCallback().then(() => { if (apiBase() && getSession()) loadRealData().catch(() => {}); });
