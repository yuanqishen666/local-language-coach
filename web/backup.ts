/**
 * A backup is a zip file laid out the way the app's data folder is on a computer: config.json, secrets.json,
 * app.db, usage.db and one profile-<id>.db for each learning profile. So the zipped data folder of the app as
 * it runs on a computer can be restored in a browser, and a backup unzipped into that folder runs there.
 */
import type { ZipEntry } from './zip'

/** Where the app keeps its data in the browser's storage. */
export const DATA_ROOT = '/data/'

export type Restored = 'restored' | 'unreadable' | 'notBackup' | 'inUse' | 'failed'

export interface Sorted {
  databases: ZipEntry[]
  files: ZipEntry[]
}

const SQLITE = 'SQLite format 3\u0000'

function isDatabase(bytes: Uint8Array) {
  return bytes.length > SQLITE.length && [...SQLITE].every((letter, at) => bytes[at] === letter.charCodeAt(0))
}

function isJson(bytes: Uint8Array) {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes))
    return Boolean(value) && typeof value === 'object'
  } catch {
    return false
  }
}

/** The databases and the other files a zip file holds, named as they are inside the data folder, or why it cannot be restored. */
export function sortBackup(entries: ZipEntry[]): Sorted | Exclude<Restored, 'restored' | 'failed'> {
  // A Mac's own zip tool adds these.
  let kept = entries.filter(({ name }) => !name.startsWith('__MACOSX/') && !name.endsWith('.DS_Store'))
  // A folder that was zipped has its own name in front of every file.
  const folder = `${kept[0]?.name.split('/')[0]}/`
  if (kept.length && kept.every(({ name }) => name.startsWith(folder))) kept = kept.map(({ name, bytes }) => ({ name: name.slice(folder.length), bytes }))

  const databases = kept.filter(({ name }) => name.endsWith('.db'))
  if (!databases.some(({ name }) => name === 'app.db') || !databases.every(({ bytes }) => isDatabase(bytes))) return 'notBackup'
  if (kept.some(({ name, bytes }) => name.endsWith('.json') && !isJson(bytes))) return 'notBackup'
  // While the app is running on a computer, its latest changes sit in a file beside each database, not in it.
  if (kept.some(({ name, bytes }) => name.endsWith('.db-wal') && bytes.length)) return 'inUse'
  return { databases, files: kept.filter(({ name }) => !/\.db(-wal|-shm|-journal)?$/u.test(name)) }
}
