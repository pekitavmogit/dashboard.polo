// PoLo Dashboard - Config central
// 1. CLIENT_ID: https://discord.com/developers/applications -> tu app -> General Information -> Application ID
// 2. REDIRECT_URI: https://discord.com/developers/applications -> OAuth2 -> Redirects -> Add, ej:
//    Local: http://localhost:8000/polo-dashboard/index.html
//    Produccion: https://tu-dominio.com/polo-dashboard/index.html
//    Debe ser EXACTA, con slash y protocolo.
// 3. SUPPORT: tu servidor -> Invitar -> Copiar enlace
// 4. API_URL: tu backend que intercambia el code por token. Sin backend el panel queda sin datos.

window.POLO_CONFIG = {
  clientId: "1463028970424373281",
  ownerId: "1352424608862572597",
  permissions: "8",
  botScopes: "bot+applications.commands",
  loginScopes: "identify guilds",
  redirectUri: window.location.origin + window.location.pathname,
  inviteUrl: "https://discord.com/oauth2/authorize?client_id=1463028970424373281",
  supportServer: "https://discord.gg/J3fK3mHA9p",
  docsUrl: "https://polo.gg/docs",
  voteUrl: "",
  apiUrl: "http://localhost:3000"
};

window.PoloLinks = {
  getInvite(cfg) {
    if (cfg.inviteUrl) return cfg.inviteUrl;
    if (!cfg.clientId || cfg.clientId === "TU_CLIENT_ID") return "";
    return `https://discord.com/oauth2/authorize?client_id=${cfg.clientId}&scope=${cfg.botScopes}&permissions=${cfg.permissions}`;
  },
  getLogin(cfg) {
    if (!cfg.clientId || cfg.clientId === "TU_CLIENT_ID") return "";
    const redirect = encodeURIComponent(cfg.redirectUri || (window.location.origin + window.location.pathname));
    const scope = encodeURIComponent(cfg.loginScopes || "identify guilds");
    return `https://discord.com/oauth2/authorize?client_id=${cfg.clientId}&redirect_uri=${redirect}&response_type=code&scope=${scope}`;
  }
};
