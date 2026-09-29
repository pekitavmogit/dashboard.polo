# PoLo Dashboard - Backend requerido

El panel ya no trae datos falsos. Todo viene de tu backend.

## Base

`API URL` en Ajustes, ej: `http://localhost:3000`

## Endpoints

### POST /auth/exchange
Intercambia el `code` de Discord OAuth2.
Body: `{ code, redirect_uri }`
Respuesta: `{ id, username, avatar, sessionToken }`

### GET /api/stats
Respuesta:
`{ ping, ram, cpu, commandsPerMin, totalCmds, uptime, online, prefix, presence }`

### GET /api/guilds
Respuesta: array o `{ guilds }`
Item: `{ id, name, memberCount, hasPolo }`

### GET /api/activity
Respuesta:
`{ activity: { labels, values }, growth: { labels, values }, top: [{ name, uses }], events: [{ tag, text }] }`

### GET /api/logs?limit=50
Respuesta: array o `{ logs }`
Item: `{ level: info|cmd|ok|warn|error, message }`

### GET /api/reports
Respuesta: array o `{ reports }`
Item: `{ user, reason, guild, severity }`

### POST /api/command
Body: `{ input: "!play url" }`
Respuesta: `{ reply }`

### POST /api/commands/toggle
Body: `{ name, enabled }`

### POST /api/moderation
Body: `{ user, action, guildId, reason }`

### POST /api/settings
Body: `{ prefix, presence, lang, automod, audit }`

### POST /api/bot/pause
### POST /api/bot/restart
### POST /api/announce | /api/clear | /api/backup | /api/update

## Notas

- Usa `Authorization: Bearer <sessionToken>` si quieres proteger las rutas.
- Sin backend el panel muestra estados vacios tipo Sin datos o Sin conexion.
- Guarda tu `logo.png` junto a `index.html`.
