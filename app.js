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
  ownerId: CFG.ownerId || '',
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
if (!S.clientId || S.clientId === 'TU_CLIENT_ID') S.clientId = CFG.clientId || S.clientId;
if (!S.inviteUrl && CFG.inviteUrl) S.inviteUrl = CFG.inviteUrl;
if (!S.supportServer || S.supportServer.includes('tu-servidor')) S.supportServer = CFG.supportServer || S.supportServer;
if (!S.apiUrl && CFG.apiUrl) S.apiUrl = CFG.apiUrl;
if (!S.ownerId && CFG.ownerId) S.ownerId = CFG.ownerId;
const save = () => localStorage.setItem('polo_state', JSON.stringify(S));

let live = true;
let stats = { ping: null, ram: null, cpu: null, cpm: null, totalCmds: 0, uptime: null, online: null };
let charts = { activity: null, growth: null };

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
function isAdmin() {
  const sess = getSession();
  if (!sess) return false;
  if (sess.isAdmin === true) return true;
  const owner = S.ownerId || CFG.ownerId || '';
  if (owner && sess.id && sess.id === owner) return true;
  return false;
}
function renderRole() {
  const admin = isAdmin();
  $$('[data-requires="admin"]').forEach(el => { el.style.display = admin ? '' : 'none'; });
  const sess = getSession();
  if (sess) {
    $('#userSub').textContent = admin ? 'admin' : 'miembro';
    $('#loginTag').textContent = admin ? 'admin' : 'miembro';
  }
  if (!admin) {
    $$('.view').forEach(v => v.classList.remove('active'));
    $('#view-servers').classList.add('active');
    $$('#mainNav button').forEach(x => x.classList.remove('active'));
    const sb = document.querySelector('[data-view="servers"]');
    if (sb) sb.classList.add('active');
  }
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
    return;
  }
  gate.classList.add('hidden');
  $('#userName').textContent = sess.username || 'Usuario';
  $('#userAvatar').textContent = (sess.username || 'U').slice(0, 2).toUpperCase();
  if (sess.avatar) $('#userAvatar').innerHTML = `<img src="${sess.avatar}" alt="avatar" />`;
  $('#authBtn').textContent = 'Salir';
  renderRole();
}
function doLogin() {
  const url = getLoginUrl();
  if (!url) { toast('Pega tu Client ID en Ajustes primero'); gotoSettings(); return; }
  window.location.href = url;
}
function doLogout() {
  setSession(null);
  S.servers = [];
  save();
  renderUser();
  renderServers();
  renderHero();
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
    setSession({
      username: j.username || j.global_name || 'Usuario',
      id: j.id || '',
      avatar: (j.id && j.avatar) ? `https://cdn.discordapp.com/avatars/${j.id}/${j.avatar}.png` : null,
      token: j.sessionToken || j.token || null,
      isAdmin: j.isAdmin === true || j.role === 'admin' || j.role === 'owner'
    });
    if (j.guilds) {
      S.servers = j.guilds.map((g, i) => ({
        id: String(g.id || i),
        name: g.name || 'Sin nombre',
        members: g.memberCount ?? g.members ?? 0,
        color: '#2f7fe0',
        hasPolo: g.hasPolo !== false,
        canManage: g.canManage === true || g.isAdmin === true || j.isAdmin === true
      }));
      save();
    }
    renderUser();
    renderServers();
    await loadRealData();
    toast('Login con Discord correcto');
  } catch {
    toast('No se pudo completar el login. Revisa tu backend');
    $('#apiMsg').textContent = 'Fallo POST /auth/exchange. Revisa BACKEND.md';
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
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('#globalSearch').focus(); }
});

// ---------- STATUS + HERO ----------
function renderStatus() {
  const online = stats.online !== false;
  $('#statusPill').classList.toggle('off', !online);
  $('#statusPill').innerHTML = `<i></i> ${online ? 'En linea' : 'Pausado'}`;
  $('#sideDot').classList.toggle('off', !online);
  $('#heroStatus').textContent = online ? 'En linea' : 'Pausado';
  $('#toggleBotBtn').textContent = online ? 'Pausar bot' : 'Reanudar bot';
  $('#sidePing').textContent = stats.ping != null ? stats.ping + 'ms' : '--';
  $('#pingBar').style.width = stats.ping != null ? Math.min(100, stats.ping / 2) + '%' : '0%';
  $('#cPing').textContent = stats.ping != null ? stats.ping + ' ms' : '--';
  $('#cRam').textContent = stats.ram != null ? stats.ram + ' MB' : '--';
  $('#cCpu').textContent = stats.cpu != null ? stats.cpu + ' %' : '--';
  $('#cCpm').textContent = stats.cpm != null ? stats.cpm : '--';
  $('#sideUptime').textContent = stats.uptime || '--';
  if (stats.ram != null) $('#ramBar').style.width = (stats.ram / 512 * 100) + '%';
  if (stats.cpu != null) $('#cpuBar').style.width = stats.cpu + '%';
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
  $('#presenceText').textContent = S.presence;
}

$('#toggleBotBtn').onclick = async () => {
  try { await apiPost('/api/bot/pause', {}); await loadStats(); }
  catch { toast('Sin conexion al bot. Configura API URL'); }
};
$('#restartBtn').onclick = async () => {
  try { await apiPost('/api/bot/restart', {}); log('warn', 'Reinicio solicitado al bot...'); }
  catch { toast('Sin conexion al bot. Configura API URL'); }
};

// ---------- CHARTS ----------
function initCharts() {
  new Chart($('#chActivity'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: '#2f7fe0', borderRadius: 4 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#e8f0fa' }, ticks: { color: '#6b82a3' } }, y: { grid: { color: '#e8f0fa' }, ticks: { color: '#6b82a3' } } } }
  }).store = 'activity';
  charts.activity = Chart.getChart($('#chActivity'));
  new Chart($('#chGrowth'), {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: '#2f7fe0', backgroundColor: 'rgba(47,127,224,.12)', fill: true, tension: .4 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#6b82a3' } }, y: { grid: { color: '#e8f0fa' }, ticks: { color: '#6b82a3' } } } }
  });
  charts.growth = Chart.getChart($('#chGrowth'));
}
function updateCharts(activity, growth, top) {
  if (activity && charts.activity) {
    charts.activity.data.labels = activity.labels || [];
    charts.activity.data.datasets[0].data = activity.values || [];
    charts.activity.update();
  }
  if (growth && charts.growth) {
    charts.growth.data.labels = growth.labels || [];
    charts.growth.data.datasets[0].data = growth.values || [];
    charts.growth.update();
  }
  if (top) {
    $('#topCmds').innerHTML = top.map((c, i) => `<div><span>${i + 1}. <b style="color:#1e2e4a">${S.prefix}${c.name}</b></span><span>${(c.uses || 0).toLocaleString()} usos</span></div>`).join('') || '<p class="muted">Sin datos.</p>';
  }
}

// ---------- FEED ----------
function renderFeed(items) {
  if (!items || !items.length) {
    $('#feed').innerHTML = '<p class="muted">Sin eventos. Conecta tu bot para ver actividad.</p>';
    return;
  }
  $('#feed').innerHTML = items.map(e => `<div class="feed-item"><span class="tag">${e.tag || 'INFO'}</span><span>${e.text}</span></div>`).join('');
}

// ---------- SERVERS ----------
function renderServers(filter = '') {
  const onlyPolo = $('#onlyPolo') ? $('#onlyPolo').checked : true;
  let list = S.servers.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));
  if (onlyPolo) list = list.filter(s => s.hasPolo);
  const withPolo = S.servers.filter(s => s.hasPolo).length;
  $('#navServerCount').textContent = withPolo;
  $('#serverCountLabel').textContent = `- ${list.length} con PoLo`;
  $('#serverSubtitle').textContent = S.servers.length
    ? `Tienes ${S.servers.length} servidores en total, ${withPolo} con PoLo instalado.`
    : 'Inicia sesion y conecta tu bot para cargar tus servidores.';
  if (!S.servers.length) {
    $('#serverGrid').innerHTML = '<p class="muted">Sin datos. Revisa BACKEND.md y pulsa Sincronizar.</p>';
    $('#modServer').innerHTML = '';
    return;
  }
  $('#serverGrid').innerHTML = list.map(s => {
    const admin = isAdmin();
    const canManage = admin || s.canManage !== false;
    return `
    <div class="server">
      <div class="server-top"><div class="s-icon" style="background:${s.color || '#2f7fe0'}">${(s.name || 'S')[0].toUpperCase()}</div>
      <div><strong>${s.name}</strong><span>${(s.members || 0).toLocaleString()} miembros</span></div></div>
      <div class="s-meta"><span class="tag green">PoLo dentro</span><span>${S.prefix}help</span>${canManage ? '' : '<span class="tag">Solo lectura</span>'}</div>
      <div class="s-actions"><button class="btn-ghost" data-manage="${s.id}">${canManage ? 'Gestionar' : 'Ver'}</button></div>
    </div>`;
  }).join('') || '<p class="muted">Ningun servidor coincide con el filtro.</p>';
  const missing = S.servers.filter(s => !s.hasPolo && s.name.toLowerCase().includes(filter.toLowerCase()));
  if (missing.length && !onlyPolo) {
    $('#serverGrid').innerHTML += missing.map(s => `
    <div class="server" style="opacity:.9">
      <div class="server-top"><div class="s-icon" style="background:#9cc6f2">${(s.name || 'S')[0].toUpperCase()}</div>
      <div><strong>${s.name}</strong><span>sin PoLo</span></div></div>
      <div class="s-meta"><span class="tag">Sin PoLo</span></div>
      <div class="s-actions"><button class="btn-primary" onclick="inviteTo('${s.id}')">Anadir PoLo</button></div>
    </div>`).join('');
  }
  $('#modServer').innerHTML = S.servers.filter(s => s.hasPolo).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  $$('#serverGrid [data-manage]').forEach(b => b.onclick = () => {
    const srv = S.servers.find(x => String(x.id) === b.dataset.manage);
    if (!isAdmin() && srv && srv.canManage === false) { toast('Solo lectura en este servidor'); return; }
    toast('Abre el panel del servidor ' + b.dataset.manage + ' desde tu backend');
  });
}
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

// ---------- COMMANDS ----------
let cat = 'all';
function renderCmds(filter = '') {
  const admin = isAdmin();
  const list = S.commands.filter(c => (cat === 'all' || c.cat === cat) && c.name.includes(filter.toLowerCase()));
  $('#cmdGrid').innerHTML = list.map(c => {
    const off = S.disabledCmds.includes(c.name);
    const sw = admin
      ? `<button class="switch ${off ? '' : 'on'}" onclick="toggleCmd('${c.name}')"></button>`
      : `<button class="switch ${off ? '' : 'on'}" disabled title="Solo lectura"></button>`;
    return `<div class="cmd"><div class="cmd-top"><code>${S.prefix}${c.name}</code>${sw}</div>
    <p>${c.desc}</p><div class="cmd-foot"><span>${c.cat}</span><span>${off ? 'OFF' : 'ON'}${admin ? '' : ' - Solo lectura'}</span></div></div>`;
  }).join('') || '<p class="muted">Sin comandos.</p>';
}
window.toggleCmd = async (n) => {
  if (!isAdmin()) { toast('Solo un admin puede cambiar comandos'); return; };
  const disabling = !S.disabledCmds.includes(n);
  if (disabling) S.disabledCmds.push(n);
  else S.disabledCmds = S.disabledCmds.filter(x => x !== n);
  save();
  renderCmds($('#cmdSearch').value);
  try { await apiPost('/api/commands/toggle', { name: n, enabled: !disabling }); }
  catch { log('warn', 'Cambio guardado local. Sin conexion al bot'); }
};
$('#catChips').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  $$('#catChips .chip').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  cat = b.dataset.cat;
  renderCmds($('#cmdSearch').value);
});
$('#cmdSearch').addEventListener('input', e => renderCmds(e.target.value));

// ---------- CONSOLE ----------
const term = () => $('#termBody');
function log(level, msg) {
  if ($('#logLevel').value !== 'all' && $('#logLevel').value !== level) return;
  const time = new Date().toLocaleTimeString('es-ES', { hour12: false });
  const colors = { info: 'log-info', cmd: 'log-cmd', ok: 'log-ok', warn: 'log-warn', error: 'log-error' };
  term().insertAdjacentHTML('beforeend', `<div class="${colors[level] || 'log-info'}">[${time}] [${level.toUpperCase()}] ${msg}</div>`);
  term().scrollTop = term().scrollHeight;
}
$('#clearLogs').onclick = () => term().innerHTML = '';
$('#pauseLogs').onclick = (e) => {
  live = !live;
  e.target.textContent = live ? 'Pausar' : 'Reanudar';
  $('#logState').textContent = live ? 'LIVE' : 'PAUSADO';
};
$('#logLevel').onchange = () => { term().innerHTML = ''; };
$('#cmdForm').addEventListener('submit', async e => {
  e.preventDefault();
  const raw = $('#cmdInput').value.trim();
  if (!raw) return;
  $('#cmdInput').value = '';
  log('cmd', `> ${raw}`);
  try {
    const res = await apiPost('/api/command', { input: raw });
    log('ok', 'PoLo: ' + (res.reply || res.message || 'OK'));
  } catch {
    log('error', 'Sin conexion al bot. Configura API URL en Ajustes');
  }
});

// ---------- MODERATION ----------
function renderReports(items) {
  if (!items || !items.length) {
    $('#reports').innerHTML = '<p class="muted">Sin reportes.</p>';
    $('#repCount').textContent = '0 pendientes';
    return;
  }
  $('#reports').innerHTML = items.map(r => `<div class="feed-item"><span class="tag">REPORT</span><span><b>${r.user}</b> - ${r.reason}<br><small style="color:#6b82a3">${r.guild} - ${r.severity}</small></span></div>`).join('');
  $('#repCount').textContent = items.length + ' pendientes';
}
$('#modForm').addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    user: $('#modUser').value,
    action: $('#modAction').value,
    guildId: $('#modServer').value,
    reason: $('#modReason').value || 'sin motivo'
  };
  try {
    await apiPost('/api/moderation', payload);
    log('warn', `MOD: ${payload.action} a ${payload.user} - ${payload.reason}`);
    toast('Sancion enviada al bot');
  } catch {
    toast('Sin conexion al bot');
  }
  e.target.reset();
});

// ---------- SETTINGS ----------
function loadSettings() {
  $('#setPrefix').value = S.prefix;
  $('#setPresence').value = S.presence;
  $('#setLang').value = S.lang;
  $('#setWelcome').value = 'Bienvenido {user}. Usa ' + S.prefix + 'help para empezar.';
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
  S.prefix = $('#setPrefix').value || '!';
  S.presence = $('#setPresence').value;
  S.lang = $('#setLang').value;
  S.clientId = $('#setClientId').value.trim();
  S.redirectUri = $('#setRedirect').value.trim();
  S.inviteUrl = $('#setInvite').value.trim();
  S.supportServer = $('#setSupport').value.trim();
  S.docsUrl = $('#setDocs').value.trim();
  S.apiUrl = $('#apiUrl').value.trim();
  save();
  try { await apiPost('/api/settings', { prefix: S.prefix, presence: S.presence, lang: S.lang, automod: S.automod, audit: S.audit }); toast('Configuracion guardada en el bot'); }
  catch { toast('Guardado local. Sin conexion al bot'); }
  renderHero();
  renderCmds();
});
$('#editPresence').onclick = () => {
  const v = prompt('Nuevo texto jugando a:', S.presence);
  if (v) { S.presence = v; save(); renderHero(); }
};
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
    $('#apiMsg').textContent = 'No se pudo conectar. Revisa BACKEND.md';
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
$('#docsBtn').onclick = () => openLink(S.docsUrl || CFG.docsUrl, 'Configura tu URL de docs en Ajustes');
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
  const j = await apiGet('/api/guilds');
  const arr = Array.isArray(j) ? j : (j.guilds || []);
  S.servers = arr.map((g, i) => ({
    id: String(g.id || i),
    name: g.name || 'Sin nombre',
    members: g.memberCount ?? g.members ?? 0,
    color: '#2f7fe0',
    hasPolo: g.hasPolo !== false
  }));
  save();
  renderServers($('#serverSearch').value);
  renderHero();
}
async function loadActivity() {
  try {
    const j = await apiGet('/api/activity');
    updateCharts(j.activity || null, j.growth || null, j.top || null);
    renderFeed(j.events || []);
  } catch { /* sin datos */ }
}
async function loadLogs() {
  try {
    const j = await apiGet('/api/logs?limit=50');
    const arr = Array.isArray(j) ? j : (j.logs || []);
    term().innerHTML = '';
    arr.forEach(e => log(e.level || 'info', e.message || ''));
  } catch { /* sin datos */ }
}
async function loadReports() {
  try {
    const j = await apiGet('/api/reports');
    renderReports(Array.isArray(j) ? j : (j.reports || []));
  } catch { renderReports([]); }
}
async function loadRealData() {
  await loadStats();
  await loadGuilds();
  await loadActivity();
  await loadLogs();
  await loadReports();
}
setInterval(() => { if (live && apiBase() && getSession()) loadStats().catch(() => {}); }, 15000);
setInterval(() => { if (live && apiBase() && getSession()) loadLogs().catch(() => {}); }, 20000);

// ---------- MISC ----------
$$('[data-qa]').forEach(b => b.onclick = async () => {
  const map = { announce: '/api/announce', clear: '/api/clear', backup: '/api/backup', update: '/api/update' };
  try { await apiPost(map[b.dataset.qa], {}); toast('Accion enviada'); }
  catch { toast('Sin conexion al bot'); }
});
$('#globalSearch').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  if (q.length > 1) { renderServers(q); renderCmds(q); }
});

// ---------- INIT ----------
renderStatus();
renderHero();
initCharts();
renderFeed([]);
renderServers();
renderCmds();
renderReports([]);
loadSettings();
renderUser();
handleOAuthCallback().then(() => { if (apiBase() && getSession()) loadRealData().catch(() => {}); });
log('info', 'Panel listo. Configura API URL y Client ID en Ajustes.');
