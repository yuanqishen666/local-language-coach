import { execFileSync, spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import QRCode from 'qrcode'
import { getConfig, dataRoot } from '../server/services/config.js'
import { clearRemoteState, getRemoteStatus, isProcessAlive, readRemoteState, writeRemoteState, type RemoteState } from '../server/services/remote.js'
import { cloudflaredVersion, ensureCloudflared } from './cloudflared.js'

interface LocalRuntimeState { version: 1; pid: number; url: string; port: number; mode: 'start' }

async function readLocalRuntime(): Promise<LocalRuntimeState | null> {
  try {
    const state = JSON.parse(await readFile(path.join(dataRoot, 'runtime.json'), 'utf8')) as LocalRuntimeState
    const url = new URL(state.url)
    if (
      state.version !== 1 ||
      state.mode !== 'start' ||
      !Number.isInteger(state.pid) ||
      !isProcessAlive(state.pid) ||
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      Number(url.port) !== state.port
    ) return null
    return state
  } catch { return null }
}

function validateEmails(values: string[]) {
  const emails = values.flatMap((value) => value.split(',')).map((value) => value.trim().toLowerCase()).filter(Boolean)
  if (!emails.length) throw new Error('At least one allowed email address is required')
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('One or more email addresses are invalid')
  return [...new Set(emails)]
}

async function assertLocalApp(target: string) {
  const health = new URL('/api/health', target)
  let response: Response
  try { response = await fetch(health, { signal: AbortSignal.timeout(5_000) }) }
  catch { throw new Error(`The local app is not running at ${target}. Run "npm start" first and keep that terminal open.`) }
  if (!response.ok) throw new Error(`The local app health check failed (${response.status})`)
  const page = await fetch(target, { signal: AbortSignal.timeout(5_000) })
  if (!page.ok || !page.headers.get('content-type')?.includes('text/html')) throw new Error('The local server is running without the built web app. Stop it, then run "npm start" again.')
}

function processIsCloudflared(pid: number) {
  if (!isProcessAlive(pid)) return false
  try {
    if (process.platform === 'win32') return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).toLowerCase().includes('cloudflared')
    return execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' }).toLowerCase().includes('cloudflared')
  } catch { return false }
}

async function waitForTunnel(pid: number, logPath: string) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) break
    const log = await readFile(logPath, 'utf8').catch(() => '')
    const url = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0]
    if (url) return url
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  const tail = (await readFile(logPath, 'utf8').catch(() => '')).slice(-1800)
  throw new Error(`Cloudflare did not create a remote URL.\n${tail}`)
}

export async function startRemote(inputEmails: string[], progress: (message: string) => void = console.log) {
  const existing = await readRemoteState()
  if (existing && processIsCloudflared(existing.pid)) {
    const requestedEmails = inputEmails.length ? validateEmails(inputEmails) : existing.allowedEmails
    if (requestedEmails.join(',') !== existing.allowedEmails.join(',')) throw new Error('Remote access is already running with a different email allowlist. Run "npm run app -- remote stop" first.')
    return existing
  }
  if (existing) await clearRemoteState()

  const emails = validateEmails(inputEmails)
  const config = await getConfig()
  const runtime = await readLocalRuntime()
  const target = process.env.LLC_REMOTE_TARGET || runtime?.url || `http://127.0.0.1:${config.server.port}`
  await assertLocalApp(target)
  const binary = await ensureCloudflared(progress)
  const logPath = path.join(dataRoot, 'remote.log')
  await writeFile(logPath, '', { mode: 0o600 })
  const logFile = openSync(logPath, 'a')
  const argumentsList = ['tunnel', '--no-autoupdate', '--url', target]
  emails.forEach((email) => argumentsList.push('--allowed-mail', email))
  const child = spawn(binary, argumentsList, { detached: true, windowsHide: true, stdio: ['ignore', logFile, logFile] })
  closeSync(logFile)
  child.unref()
  try {
    const url = await waitForTunnel(child.pid!, logPath)
    const state: RemoteState = { version: 1, provider: 'cloudflare-quick', pid: child.pid!, url, hostname: new URL(url).hostname, allowedEmails: emails, target, startedAt: new Date().toISOString() }
    await writeRemoteState(state)
    return state
  } catch (error) {
    if (child.pid && processIsCloudflared(child.pid)) process.kill(child.pid, 'SIGTERM')
    throw error
  }
}

export async function stopRemote() {
  const state = await readRemoteState()
  if (!state) return { stopped: false, message: 'Remote access is not configured.' }
  if (isProcessAlive(state.pid) && !processIsCloudflared(state.pid)) throw new Error(`Refusing to stop PID ${state.pid}: it is no longer the Cloudflare tunnel process`)
  if (processIsCloudflared(state.pid)) {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(state.pid), '/T', '/F'], { stdio: 'ignore' })
    else {
      process.kill(state.pid, 'SIGTERM')
      const deadline = Date.now() + 3_000
      while (processIsCloudflared(state.pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100))
      if (processIsCloudflared(state.pid)) process.kill(state.pid, 'SIGKILL')
    }
  }
  await clearRemoteState()
  return { stopped: true, message: 'Remote access stopped. The temporary URL is no longer valid.' }
}

export async function describeRemote() {
  const status = await getRemoteStatus()
  if (!status.active) return status
  const state = status as RemoteState & { active: true }
  const binary = await ensureCloudflared()
  return { ...state, versionLabel: await cloudflaredVersion(binary) }
}

export async function remoteQr(url: string) {
  return QRCode.toString(url, { type: 'terminal', small: true, errorCorrectionLevel: 'M' })
}
