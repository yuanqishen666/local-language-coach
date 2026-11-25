/** The part of node:fs and node:fs/promises the app uses, over what a browser stores (see ../storage). */
import { Buffer } from './buffer'
import { isPackaged, readPackaged, removeDatabaseFile, smallFiles } from '../storage'

type Encoding = 'utf8' | 'utf-8' | { encoding?: 'utf8' | 'utf-8' | null } | null

// The app tells a missing file from a broken one by these codes.
function failure(code: 'ENOENT' | 'EEXIST', path: string) {
  return Object.assign(new Error(`${code}: ${code === 'ENOENT' ? 'no such file or directory' : 'file already exists'}, '${path}'`), { code, path })
}

function read(path: string, encoding?: Encoding): any {
  const body = smallFiles.read(path)
  if (!body) throw failure('ENOENT', path)
  return (typeof encoding === 'string' ? encoding : encoding?.encoding) ? new TextDecoder().decode(body) : Buffer.from(body)
}

const bytes = (data: string | Uint8Array) => typeof data === 'string' ? new TextEncoder().encode(data) : data

export const constants = { COPYFILE_EXCL: 1 }

export async function readFile(path: string, encoding?: Encoding) {
  return read(path, encoding)
}

export async function writeFile(path: string, data: string | Uint8Array, _options?: unknown) {
  smallFiles.write(path, bytes(data))
}

export async function rename(from: string, to: string) {
  if (!smallFiles.move(from, to)) throw failure('ENOENT', from)
}

export async function copyFile(from: string, to: string, mode = 0) {
  const body = read(from)
  if (mode & constants.COPYFILE_EXCL && smallFiles.modified(to) !== undefined) throw failure('EEXIST', to)
  smallFiles.write(to, body)
}

export async function unlink(path: string) {
  if (!smallFiles.remove(path)) throw failure('ENOENT', path)
}

/** Removes a small file or a database file, whichever `path` is. */
export async function rm(path: string, options: { force?: boolean } = {}) {
  if (!smallFiles.remove(path) && !removeDatabaseFile(path) && !options.force) throw failure('ENOENT', path)
}

export async function stat(path: string) {
  const modified = smallFiles.modified(path)
  if (modified === undefined) throw failure('ENOENT', path)
  return { mtimeMs: modified }
}

export async function open(path: string, flags = 'r', _mode?: number) {
  const there = smallFiles.modified(path) !== undefined
  if (flags.includes('x') && there) throw failure('EEXIST', path)
  if (flags.includes('w')) smallFiles.write(path, new Uint8Array())
  else if (!there) throw failure('ENOENT', path)
  return {
    writeFile: async (data: string | Uint8Array) => smallFiles.write(path, bytes(data)),
    sync: async () => undefined,
    close: async () => undefined,
  }
}

// There are no folders to make: a file's whole address is its name.
export async function mkdir(_path: string, _options?: unknown) {}

export function mkdirSync(_path: string, _options?: unknown) {}

export function existsSync(path: string) {
  return isPackaged(path) || smallFiles.modified(path) !== undefined
}

export function readFileSync(path: string, encoding?: Encoding) {
  return isPackaged(path) ? readPackaged(path) : read(path, encoding)
}
