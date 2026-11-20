/**
 * Opening the app to other devices on the same home network, at this computer's own address.
 * Off unless switched on. A device that is not this computer has to arrive at one of this
 * computer's own addresses and give the access code once; the code is then kept in a cookie.
 * The connection is plain http, so a microphone will not work from those devices: browsers
 * only give the microphone to https pages and to localhost.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import os from 'node:os'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getConfig, getSecrets, saveConfigAndSecrets } from './services/config.js'
import { isLoopbackAddress } from './services/remote.js'
import { localeMeta, type UiLocale } from '../shared/locales.js'

const SECRET_KEY = 'lan.accessCode'
const COOKIE = 'yujian_lan'
const CODE_LENGTH = 8
/** No 0, O, 1, I or L: the code is read off one screen and typed on another. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const MAX_WRONG = 5
const WRONG_WINDOW = 10 * 60_000
const ENTER_PATH = '/api/lan/enter'

let listening = false
const wrong = new Map<string, { count: number; until: number }>()

/** Called once the server is bound to every interface rather than to this computer alone. */
export function setLanListening(value: boolean) {
  listening = value
}

export function isPrivateIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)
}

/**
 * The names this computer answers to on the home network: its private addresses, its .local name
 * when it has one, and any names given in LLC_LAN_HOSTS (comma-separated), for a name the router
 * hands out such as mac.lan.
 */
export function lanHosts(interfaces = os.networkInterfaces(), hostname = os.hostname(), extra = process.env.LLC_LAN_HOSTS || '') {
  const hosts: string[] = []
  for (const list of Object.values(interfaces)) {
    for (const item of list || []) {
      if (!item.internal && item.family === 'IPv4' && isPrivateIpv4(item.address)) hosts.push(item.address)
    }
  }
  const name = hostname.trim().toLowerCase()
  if (/^[a-z0-9-]+\.local$/u.test(name)) hosts.push(name)
  for (const given of extra.split(',')) {
    const host = given.trim().toLowerCase()
    if (/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/u.test(host)) hosts.push(host)
  }
  return [...new Set(hosts)]
}

export function newAccessCode() {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
}

function normalizeCode(value: unknown) {
  return typeof value === 'string' ? value.replace(/[\s-]/gu, '').toUpperCase() : ''
}

function tokenFor(code: string) {
  return createHash('sha256').update(`yujian-lan:${code}`).digest('hex')
}

function same(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function cookieValue(header: string | undefined) {
  for (const part of (header || '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE) return rest.join('=')
  }
  return ''
}

const ENTRY_TEXT: Record<UiLocale, { label: string; enter: string; wrong: string; wait: string }> = {
  'zh-CN': { label: '访问码', enter: '进入', wrong: '访问码不对', wait: '试的次数太多，十分钟后再试' },
  'en-US': { label: 'Access code', enter: 'Enter', wrong: 'That code is not right', wait: 'Too many tries. Try again in ten minutes' },
  'es-419': { label: 'Código de acceso', enter: 'Entrar', wrong: 'El código no es correcto', wait: 'Demasiados intentos. Prueba de nuevo en diez minutos' },
  'fr-FR': { label: 'Code d’accès', enter: 'Entrer', wrong: 'Ce code n’est pas le bon', wait: 'Trop d’essais. Réessayez dans dix minutes' },
  'ja-JP': { label: 'アクセスコード', enter: '入る', wrong: 'コードが違います', wait: '試行回数が多すぎます。10分後にもう一度お試しください' },
  'de-DE': { label: 'Zugangscode', enter: 'Öffnen', wrong: 'Der Code stimmt nicht', wait: 'Zu viele Versuche. Versuch es in zehn Minuten noch einmal' },
  'ko-KR': { label: '접속 코드', enter: '들어가기', wrong: '코드가 맞지 않아요', wait: '너무 여러 번 시도했어요. 10분 뒤에 다시 해 보세요' },
  'it-IT': { label: 'Codice di accesso', enter: 'Entra', wrong: 'Il codice non è giusto', wait: 'Troppi tentativi. Riprova tra dieci minuti' },
  'pt-BR': { label: 'Código de acesso', enter: 'Entrar', wrong: 'O código não está certo', wait: 'Tentativas demais. Tente de novo em dez minutos' },
  'hi-IN': { label: 'एक्सेस कोड', enter: 'खोलें', wrong: 'कोड सही नहीं है', wait: 'बहुत बार कोशिश हो चुकी है। दस मिनट बाद फिर कोशिश करें' },
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/gu, (char) => `&#${char.charCodeAt(0)};`)
}

/** The one page a device sees before it has given the code. Everything it needs is in the page itself. */
export function entryPage(locale: UiLocale) {
  const text = ENTRY_TEXT[locale] || ENTRY_TEXT['en-US']
  const messages = JSON.stringify({ wrong: text.wrong, wait: text.wait }).replace(/</gu, '\\u003c')
  return `<!doctype html>
<html lang="${localeMeta(locale).htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(text.label)}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f3ee;color:#2b2622;font:16px/1.5 system-ui,sans-serif}
form{display:grid;gap:12px;width:min(320px,86vw)}
label{font-size:14px}
input{font:inherit;font-size:20px;letter-spacing:.12em;text-transform:uppercase;padding:10px 12px;border:1px solid #c9c0b4;border-radius:8px;background:#fff}
button{font:inherit;padding:10px 12px;border:0;border-radius:8px;background:#2b2622;color:#fff}
p{margin:0;min-height:1.5em;font-size:14px;color:#a33a2a}
</style>
</head>
<body>
<form id="f">
<label for="c">${escapeHtml(text.label)}</label>
<input id="c" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" required autofocus>
<button>${escapeHtml(text.enter)}</button>
<p id="m" role="alert"></p>
</form>
<script>
var t=${messages};
document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();
fetch('${ENTER_PATH}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:document.getElementById('c').value})})
.then(function(r){if(r.ok){location.reload()}else{document.getElementById('m').textContent=r.status===429?t.wait:t.wrong}})
.catch(function(){document.getElementById('m').textContent=t.wrong})});
</script>
</body>
</html>
`
}

function hostOf(request: FastifyRequest) {
  try { return new URL(`http://${request.headers.host}`).hostname.replace(/^\[|\]$/gu, '').toLowerCase() }
  catch { return '' }
}

/**
 * Decides a request that did not come from this computer. Returns true when it may go on;
 * otherwise the reply has been sent.
 */
export async function admitFromNetwork(request: FastifyRequest, reply: FastifyReply) {
  const config = await getConfig()
  if (!config.server.lan) { reply.code(403).send({ error: 'Host not allowed' }); return false }
  // The address typed has to be this computer's own, which a page on another site cannot arrange.
  const host = hostOf(request)
  if (!host || !lanHosts().includes(host)) { reply.code(403).send({ error: 'Host not allowed' }); return false }
  const origin = request.headers.origin
  if (origin) {
    let originHost = ''
    try { originHost = new URL(origin).host.toLowerCase() } catch {}
    if (originHost !== String(request.headers.host).toLowerCase()) { reply.code(403).send({ error: 'Origin not allowed' }); return false }
  }
  const path = request.url.split('?')[0]
  if (request.method === 'POST' && path === ENTER_PATH) return true
  const code = (await getSecrets())[SECRET_KEY] || ''
  if (code && same(cookieValue(request.headers.cookie), tokenFor(code))) {
    // What opens the app to the network is managed from the computer itself.
    if (path.startsWith('/api/lan')) { reply.code(403).send({ error: 'Only on the computer the app runs on.', code: 'LAN_LOCAL_ONLY' }); return false }
    return true
  }
  if (path.startsWith('/api/')) { reply.code(401).send({ error: 'Access code required', code: 'LAN_CODE_REQUIRED' }); return false }
  reply.code(401).header('cache-control', 'no-store').type('text/html; charset=utf-8').send(entryPage(config.ui.locale))
  return false
}

async function status(port: number) {
  const config = await getConfig()
  const enabled = Boolean(config.server.lan)
  return {
    enabled,
    /** Whether the running server can be reached from the network now. Differs from `enabled` until the app is started again. */
    listening,
    code: enabled ? (await getSecrets())[SECRET_KEY] || '' : '',
    addresses: lanHosts().map((host) => `http://${host}:${port}`),
  }
}

export function registerLanRoutes(app: FastifyInstance, options: { port: () => number }) {
  const localOnly = (request: FastifyRequest) => {
    if (!isLoopbackAddress(request.socket.remoteAddress)) throw Object.assign(new Error('Only on the computer the app runs on.'), { statusCode: 403, code: 'LAN_LOCAL_ONLY' })
  }

  app.get('/api/lan', async (request) => { localOnly(request); return status(options.port()) })

  app.put<{ Body: { enabled?: boolean } }>('/api/lan', async (request) => {
    localOnly(request)
    const config = structuredClone(await getConfig())
    const secrets = await getSecrets()
    config.server = { ...config.server, lan: request.body?.enabled === true }
    if (config.server.lan && !secrets[SECRET_KEY]) secrets[SECRET_KEY] = newAccessCode()
    await saveConfigAndSecrets(config, secrets)
    return status(options.port())
  })

  // A new code turns away every device that entered the old one.
  app.post('/api/lan/code', async (request) => {
    localOnly(request)
    const secrets = await getSecrets()
    secrets[SECRET_KEY] = newAccessCode()
    await saveConfigAndSecrets(await getConfig(), secrets)
    return status(options.port())
  })

  app.post<{ Body: { code?: string } }>(ENTER_PATH, async (request, reply) => {
    const address = request.socket.remoteAddress || ''
    const now = Date.now()
    const tries = wrong.get(address)
    if (tries && tries.until <= now) wrong.delete(address)
    if ((wrong.get(address)?.count || 0) >= MAX_WRONG) return reply.code(429).send({ error: 'Too many tries', code: 'LAN_TOO_MANY' })
    const code = (await getSecrets())[SECRET_KEY] || ''
    if (!code || !(await getConfig()).server.lan || !same(normalizeCode(request.body?.code), code)) {
      const entry = wrong.get(address) || { count: 0, until: now + WRONG_WINDOW }
      entry.count += 1
      wrong.set(address, entry)
      return reply.code(401).send({ error: 'Wrong access code', code: 'LAN_CODE_WRONG' })
    }
    wrong.delete(address)
    reply.header('set-cookie', `${COOKIE}=${tokenFor(code)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict`)
    return { ok: true }
  })
}
