/** The background thread of the web version: the app's routes, answering the page from inside the browser. */
import './node/globals'
import { AsyncLocalStorage } from './node/async-hooks'
import { DATA_ROOT, sortBackup, type Restored } from './backup'
import { copyAside, databaseFiles, openStorage, replaceEverything, smallFiles, type Opened, type StoredFile } from './storage'
import { createRouteTable, type Answer, type Asked } from './table'
import { PutBack, startKeepingCopy, type Kept } from './upgrade'
import { unzip, zip } from './zip'

export type ToThread = { id: number } & ({ start: true } | { ask: Asked } | { pack: true } | { restore: Uint8Array })
/** The reply to a message is an Opened, an Answer, the bytes of a backup file or a Restored, in that order. */
export interface FromThread { id: number; reply: unknown }

// Anthropic answers a page only when the request says it knows it comes from one.
const send = globalThis.fetch
globalThis.fetch = (input, init) => {
  const headers = new Headers(init?.headers)
  if (!headers.has('anthropic-version')) return send(input, init)
  headers.set('anthropic-dangerous-direct-browser-access', 'true')
  return send(input, { ...init, headers })
}

let answer: ((asked: Asked) => Promise<Answer>) | undefined

// The build names this file after its contents, so another name is another version of the app. The dev server
// always gives it the same name, so there nothing is ever set aside.
const VERSION = self.location.pathname
// Beside the data folder, so that neither is part of a backup.
const VERSION_FILE = '/web/version'
const UNFINISHED_FILE = '/web/unfinished'
const said = (error: unknown) => error instanceof Error || error instanceof DOMException ? error.name : 'Error'

const kept: Kept = {
  version() {
    const bytes = smallFiles.read(VERSION_FILE)
    return bytes && new TextDecoder().decode(bytes)
  },
  setVersion: (version) => smallFiles.write(VERSION_FILE, new TextEncoder().encode(version)),
  unfinished: () => smallFiles.read(UNFINISHED_FILE) !== undefined,
  setUnfinished(unfinished) {
    if (unfinished) smallFiles.write(UNFINISHED_FILE, new TextEncoder().encode(VERSION))
    else smallFiles.remove(UNFINISHED_FILE)
  },
  everything: () => ({ databases: databaseFiles(), files: smallFiles.all() }),
  replace: (all) => replaceEverything(all.databases, all.files),
  async setAside(all) {
    const under = (folder: string, files: StoredFile[]) => files.map(({ name, bytes }) => ({ name: folder + name, bytes }))
    await copyAside.write(await zip([...under('databases', all.databases), ...under('files', all.files)]))
  },
  async copySetAside() {
    const copy = await copyAside.read()
    const entries = copy && await unzip(copy).catch(() => undefined)
    if (!entries) return undefined
    const under = (folder: string) => entries.filter(({ name }) => name.startsWith(`${folder}/`)).map(({ name, bytes }) => ({ name: name.slice(folder.length), bytes }))
    return { databases: under('databases'), files: under('files') }
  },
}

// The app's modules open their files as they load, so none is loaded before there is somewhere to open them.
async function load() {
  const [{ registerRoutes }, { openActiveProfile }] = await Promise.all([import('../server/routes'), import('../server/profiles')])
  await openActiveProfile()
  const table = createRouteTable()
  registerRoutes(table.app, { port: () => 0 })
  answer = table.answer
}

async function start(): Promise<Opened> {
  const probe = new AsyncLocalStorage<boolean>()
  const followed = await probe.run(true, async () => {
    await undefined
    return probe.getStore() === true
  })
  if (!followed) console.warn('This build keeps native await, so usage is recorded without the task it belongs to. See web/node/async-hooks.ts.')

  const opened = await openStorage()
  if (opened.state !== 'ready') return opened
  try {
    await startKeepingCopy(kept, VERSION, load)
  } catch (error) {
    if (!(error instanceof PutBack)) throw error
    answer = undefined
    return { state: 'putBack', detail: `storage-upgrade (${said(error.why)})` }
  }
  return opened
}

async function pack() {
  const kept = [...smallFiles.all(), ...databaseFiles()].filter(({ name }) => name.startsWith(DATA_ROOT))
  return zip(kept.map(({ name, bytes }) => ({ name: name.slice(DATA_ROOT.length), bytes })))
}

async function restore(file: Uint8Array): Promise<Restored> {
  const sorted = await unzip(file).then(sortBackup, () => 'unreadable' as const)
  if (typeof sorted === 'string') return sorted
  const inData = ({ name, bytes }: StoredFile) => ({ name: DATA_ROOT + name, bytes })
  const before = { databases: databaseFiles(), files: smallFiles.all() }
  // The app's modules hold on to what they opened, so nothing more is answered until the page starts a new thread.
  answer = undefined
  try {
    await replaceEverything(sorted.databases.map(inData), sorted.files.map(inData))
    return 'restored'
  } catch {
    await replaceEverything(before.databases, before.files)
    return 'failed'
  }
}

let starting: Promise<Opened> | undefined

self.onmessage = async ({ data }: MessageEvent<ToThread>) => {
  const reply = (value: unknown, transfer: Transferable[] = []) => self.postMessage({ id: data.id, reply: value } satisfies FromThread, { transfer })
  if ('start' in data) {
    starting ||= start().catch((error) => ({ state: 'failed' as const, detail: `start-app (${said(error)})` }))
    return reply({ ...await starting, version: VERSION.split('/').at(-1) })
  }
  if ('pack' in data) {
    const file = await pack()
    return reply(file, [file.buffer])
  }
  if ('restore' in data) return reply(await restore(data.restore))
  reply(answer ? await answer(data.ask) : { status: 503, body: JSON.stringify({ error: 'Not started' }) })
}
