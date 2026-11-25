/** The page's side of the background thread, which runs the app's routes and keeps its data. */
import type { Restored } from './backup'
import type { Opened } from './storage'
import type { Answer, Asked } from './table'
import type { FromThread, ToThread } from './worker'

let thread: Worker | undefined
const waiting = new Map<number, { resolve: (reply: unknown) => void, reject: (error: Error) => void }>()
let told = 0

export class ThreadError extends Error {
  constructor(readonly code: 'worker-load' | 'worker-message' | 'worker-timeout' | 'worker-stopped') { super(code) }
}

export function stopThread(error = new ThreadError('worker-stopped')) {
  thread?.terminate()
  thread = undefined
  for (const { reject } of waiting.values()) reject(error)
  waiting.clear()
}

function createThread() {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }: MessageEvent<FromThread>) => {
    if (thread !== worker) return
    waiting.get(data.id)?.resolve(data.reply)
    waiting.delete(data.id)
  }
  worker.onerror = () => { if (thread === worker) stopThread(new ThreadError('worker-load')) }
  worker.onmessageerror = () => { if (thread === worker) stopThread(new ThreadError('worker-message')) }
  return worker
}

type Told = ToThread extends infer Each ? Omit<Each, 'id'> : never

function tell<Reply>(message: Told, transfer: Transferable[] = []) {
  return new Promise<Reply>((resolve, reject) => {
    if (!thread) return reject(new ThreadError('worker-stopped'))
    const id = ++told
    waiting.set(id, { resolve: resolve as (reply: unknown) => void, reject })
    try { thread.postMessage({ ...message, id }, transfer) }
    catch (error) { waiting.delete(id); reject(error) }
  })
}

export async function startThread() {
  try { thread ??= createThread() }
  catch { throw new ThreadError('worker-load') }
  const timeout = setTimeout(() => stopThread(new ThreadError('worker-timeout')), 25_000)
  try { return await tell<Opened>({ start: true }) }
  finally { clearTimeout(timeout) }
}
export const ask = (asked: Asked) => tell<Answer>({ ask: asked })
/** Everything this browser keeps for the app, as one backup file. */
export const packBackup = () => tell<Uint8Array<ArrayBuffer>>({ pack: true })
/** Replaces everything this browser keeps with what a backup file holds. Once it has, the page has to be loaded again. */
export const restoreBackup = (file: Uint8Array<ArrayBuffer>) => tell<Restored>({ restore: file }, [file.buffer])
