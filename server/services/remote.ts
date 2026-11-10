import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dataRoot } from './config.js'

export interface RemoteState {
  version: 1
  provider: 'cloudflare-quick'
  pid: number
  url: string
  hostname: string
  allowedEmails: string[]
  target: string
  startedAt: string
}

const statePath = path.join(dataRoot, 'remote.json')

export async function readRemoteState(): Promise<RemoteState | null> {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8')) as RemoteState
    if (
      state.version !== 1 ||
      state.provider !== 'cloudflare-quick' ||
      !Number.isInteger(state.pid) ||
      !state.url?.startsWith('https://') ||
      new URL(state.url).hostname !== state.hostname ||
      !Array.isArray(state.allowedEmails)
    ) return null
    return state
  } catch { return null }
}

export async function writeRemoteState(state: RemoteState) {
  await mkdir(dataRoot, { recursive: true, mode: 0o700 })
  const temporary = `${statePath}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, statePath)
}

export async function clearRemoteState() {
  await unlink(statePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
}

export function isProcessAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

export function isLoopbackAddress(address?: string) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

export function isRemoteRequestAllowed(state: RemoteState | null, input: { hostname?: string; origin?: string; remoteAddress?: string }) {
  if (!state || !isProcessAlive(state.pid) || !isLoopbackAddress(input.remoteAddress)) return false
  const expectedOrigin = state.url.replace(/\/$/, '')
  const hostMatches = input.hostname?.toLowerCase() === state.hostname.toLowerCase()
  const originMatches = input.origin === undefined || input.origin.replace(/\/$/, '') === expectedOrigin
  return hostMatches && originMatches
}

export async function getRemoteStatus() {
  const state = await readRemoteState()
  if (!state || !isProcessAlive(state.pid)) return { active: false as const }
  return { active: true as const, ...state }
}

export const remoteStateFile = statePath
