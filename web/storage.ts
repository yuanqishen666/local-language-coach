/**
 * What the app stores, in a browser. Its database files live in the site's private file area, in the pool of
 * files SQLite keeps there, which one tab at a time can hold. The few small files the app writes beside its
 * databases (settings, keys) are rows of one more database, so they are saved the same way.
 */
import sqlite3InitModule, { type Database as Handle, type SAHPoolUtil, type Sqlite3Static } from '@sqlite.org/sqlite-wasm'

const POOL = 'local-language-coach'
const SMALL_FILES = '/files.db'
// Twelve learners' databases, the usage database and the small files, with a journal beside each one that is open.
const FILES_AT_ONCE = 24
// A reloaded page starts its new thread before the old one has let go of the files.
const TRIES = 4
const TRY_GAP_MS = 250

export interface Opened {
  /**
   * `busy`: another tab holds the files. `unsupported`: this browser cannot keep them.
   * `putBack`: this version of the app could not start with what is stored, which is as it was before it tried.
   */
  state: 'ready' | 'busy' | 'unsupported' | 'failed' | 'putBack'
  detail?: string
  version?: string
}

export interface StoredFile { name: string; bytes: Uint8Array }

let sqlite3: Sqlite3Static
let pool: SAHPoolUtil
let small: Handle
const open = new Set<Handle>()

function heldElsewhere(error: unknown) {
  const text = `${(error as Error)?.name} ${(error as Error)?.message}`
  return /NoModificationAllowedError|Access Handles cannot be created|another open Access Handle/iu.test(text)
}

/** Takes this site's one turn at the files, for as long as this thread lives, so that a second tab is told without trying them. */
async function takeTurn() {
  for (let tries = 1; ; tries += 1) {
    const taken = await new Promise<boolean>((answer, reject) => {
      void navigator.locks.request(POOL, { ifAvailable: true }, (turn) => {
        answer(Boolean(turn))
        return turn ? new Promise<never>(() => undefined) : undefined
      }).catch(reject)
    })
    if (taken || tries >= TRIES) return taken
    await new Promise((resolve) => setTimeout(resolve, TRY_GAP_MS))
  }
}

export async function openStorage(): Promise<Opened> {
  if (!navigator.storage?.getDirectory || !navigator.locks || typeof FileSystemFileHandle === 'undefined' || !('createSyncAccessHandle' in FileSystemFileHandle.prototype)) {
    return { state: 'unsupported' }
  }
  let stage = 'storage-lock'
  try {
    if (!(await takeTurn())) return { state: 'busy' }
    stage = 'storage-directory'
    await navigator.storage.getDirectory()
    stage = 'sqlite-wasm'
    sqlite3 = await sqlite3InitModule()
    stage = 'sqlite-opfs-pool'
    for (let tries = 1; ; tries += 1) {
      try {
        // Left to itself, the engine deletes everything it has stored when it fails to take hold of its files,
        // which is what happens while a page being reloaded, or another tab, still has them.
        // The types that come with the engine do not list the option that lets it try again.
        const options = { name: POOL, preserveOnInitFailure: true, forceReinitIfPreviouslyFailed: true }
        pool = await sqlite3.installOpfsSAHPoolVfs(options)
        break
      } catch (error) {
        if (!heldElsewhere(error) || tries >= TRIES) throw error
        await new Promise((resolve) => setTimeout(resolve, TRY_GAP_MS))
      }
    }
    stage = 'sqlite-opfs-capacity'
    await pool.reserveMinimumCapacity(FILES_AT_ONCE)
    stage = 'sqlite-database'
    small = new pool.OpfsSAHPoolDb(SMALL_FILES)
    small.exec('CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, body BLOB NOT NULL, modified_at INTEGER NOT NULL)')
    return { state: 'ready' }
  } catch (error) {
    const name = error instanceof Error || error instanceof DOMException ? error.name : 'Error'
    const state = heldElsewhere(error) ? 'busy' : stage === 'storage-directory' || name === 'NotSupportedError' || name === 'SecurityError' ? 'unsupported' : 'failed'
    return { state, detail: `${stage} (${name})` }
  }
}

export function openDatabaseFile(name: string) {
  const handle = new pool.OpfsSAHPoolDb(name)
  open.add(handle)
  return handle
}

export function closeDatabaseFile(handle: Handle) {
  open.delete(handle)
  handle.close()
}

export function removeDatabaseFile(name: string) {
  return pool.unlink(name)
}

export function lastRowId(handle: Handle) {
  return Number(sqlite3.capi.sqlite3_last_insert_rowid(handle))
}

export const smallFiles = {
  read(path: string) {
    return small.selectValue('SELECT body FROM files WHERE path = ?', [path]) as Uint8Array | undefined
  },
  /** When the file was last written, or nothing when there is no such file. */
  modified(path: string) {
    return small.selectValue('SELECT modified_at FROM files WHERE path = ?', [path]) as number | undefined
  },
  write(path: string, body: Uint8Array) {
    small.exec({
      sql: 'INSERT INTO files (path, body, modified_at) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET body = excluded.body, modified_at = excluded.modified_at',
      bind: [path, body, Date.now()],
    })
  },
  /** Takes the place of whatever is at `to`, in one step. */
  move(from: string, to: string) {
    small.exec({ sql: 'UPDATE OR REPLACE files SET path = ? WHERE path = ?', bind: [to, from] })
    return small.changes() > 0
  },
  remove(path: string) {
    small.exec({ sql: 'DELETE FROM files WHERE path = ?', bind: [path] })
    return small.changes() > 0
  },
  all(): StoredFile[] {
    return (small.selectObjects('SELECT path, body FROM files ORDER BY path') as Array<{ path: string; body: Uint8Array }>)
      .map(({ path, body }) => ({ name: path, bytes: body }))
  },
}

/** Every database file as it is now, apart from the one the small files are rows of. */
export function databaseFiles(): StoredFile[] {
  return pool.getFileNames()
    .filter((name) => name !== SMALL_FILES && !name.endsWith('-journal'))
    .map((name) => ({ name, bytes: pool.exportFile(name) }))
}

/**
 * Puts `databases` and `files` in the place of everything stored. Every open database is closed first, so
 * nothing here answers afterwards until the thread is started again.
 */
export async function replaceEverything(databases: StoredFile[], files: StoredFile[]) {
  for (const handle of open) handle.close()
  open.clear()
  for (const name of pool.getFileNames()) if (name !== SMALL_FILES) pool.unlink(name)
  for (const { name, bytes } of databases) await pool.importDb(name, bytes)
  small.exec('BEGIN IMMEDIATE')
  try {
    small.exec('DELETE FROM files')
    for (const { name, bytes } of files) smallFiles.write(name, bytes)
    small.exec('COMMIT')
  } catch (error) {
    small.exec('ROLLBACK')
    throw error
  }
}

const COPY = 'before-update.zip'

// The page's types leave out what only a background thread may call.
interface FileAtOnce {
  truncate(size: number): void
  write(bytes: Uint8Array, options: { at: number }): number
  flush(): void
  close(): void
}

/** One file beside the databases and apart from what the app stores: the copy set aside before a new version first starts. */
export const copyAside = {
  async write(bytes: Uint8Array) {
    const folder = await navigator.storage.getDirectory()
    const handle = await folder.getFileHandle(COPY, { create: true }) as FileSystemFileHandle & { createSyncAccessHandle(): Promise<FileAtOnce> }
    const file = await handle.createSyncAccessHandle()
    try {
      file.truncate(0)
      file.write(bytes, { at: 0 })
      file.flush()
    } finally {
      file.close()
    }
  },
  async read() {
    try {
      const folder = await navigator.storage.getDirectory()
      const file = await (await folder.getFileHandle(COPY)).getFile()
      return new Uint8Array(await file.arrayBuffer())
    } catch {
      return undefined
    }
  },
}

// Files packaged with the app, which under Node it reads from the folder it runs in. Here each is fetched from the
// site the first time it is asked for.
const packaged = Object.fromEntries(Object.entries(
  import.meta.glob('../resources/wordfreq/*.txt', { query: '?url', import: 'default', eager: true }) as Record<string, string>,
).map(([file, address]) => [file.replace(/^\.\./u, ''), address]))

export function isPackaged(path: string) {
  return path in packaged
}

/**
 * The text of a packaged file. The app reads these in the middle of its work and cannot wait, so the thread
 * stops until the file has come; a thread other than the page's is allowed to.
 */
export function readPackaged(path: string) {
  const request = new XMLHttpRequest()
  request.open('GET', packaged[path], false)
  request.send()
  if (request.status !== 200) throw new Error(`Could not fetch ${path} (${request.status})`)
  return request.responseText
}
