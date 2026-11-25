/** Reads and writes zip files with what a browser has, so that a backup is one file any computer can open. */

export interface ZipEntry { name: string; bytes: Uint8Array }

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
const STORED = 0
const DEFLATED = 8
// Names are UTF-8.
const FLAGS = 0x0800

const crcTable = Uint32Array.from({ length: 256 }, (_unused, byte) => {
  let value = byte
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value
})

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer())
}

function joined(parts: Uint8Array[]) {
  const all = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let at = 0
  for (const part of parts) {
    all.set(part, at)
    at += part.length
  }
  return all
}

function header(size: number, fill: (view: DataView) => void) {
  const bytes = new Uint8Array(size)
  fill(new DataView(bytes.buffer))
  return bytes
}

export async function zip(entries: ZipEntry[], at = new Date()) {
  const time = (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1)
  const date = ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate()
  const parts: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name)
    const squeezed = await through(entry.bytes, new CompressionStream('deflate-raw'))
    const [method, data] = squeezed.length < entry.bytes.length ? [DEFLATED, squeezed] : [STORED, entry.bytes]
    const crc = crc32(entry.bytes)
    // The sizes and where each file starts are written in four bytes each.
    if (entry.bytes.length > 0xfffffffe || offset > 0xfffffffe) throw new Error('Too large for one zip file')
    const shared = (view: DataView, from: number) => {
      view.setUint16(from, 20, true)
      view.setUint16(from + 2, FLAGS, true)
      view.setUint16(from + 4, method, true)
      view.setUint16(from + 6, time, true)
      view.setUint16(from + 8, date, true)
      view.setUint32(from + 10, crc, true)
      view.setUint32(from + 14, data.length, true)
      view.setUint32(from + 18, entry.bytes.length, true)
      view.setUint16(from + 22, name.length, true)
    }
    const local = header(30, (view) => {
      view.setUint32(0, LOCAL, true)
      shared(view, 4)
    })
    directory.push(header(46, (view) => {
      view.setUint32(0, CENTRAL, true)
      view.setUint16(4, 20, true)
      shared(view, 6)
      view.setUint32(42, offset, true)
    }), name)
    parts.push(local, name, data)
    offset += local.length + name.length + data.length
  }
  const listed = joined(directory)
  return joined([...parts, listed, header(22, (view) => {
    view.setUint32(0, END, true)
    view.setUint16(8, entries.length, true)
    view.setUint16(10, entries.length, true)
    view.setUint32(12, listed.length, true)
    view.setUint32(16, offset, true)
  })])
}

/** The files in a zip file, folders left out. Throws when the bytes are not a zip file this can read. */
export async function unzip(file: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  let end = file.length - 22
  // A comment may follow the closing record, so it is looked for from the back.
  while (end >= 0 && view.getUint32(end, true) !== END) end -= 1
  if (end < 0) throw new Error('Not a zip file')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const entries: ZipEntry[] = []
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(at, true) !== CENTRAL) throw new Error('Not a zip file')
    const method = view.getUint16(at + 10, true)
    const crc = view.getUint32(at + 16, true)
    const packed = view.getUint32(at + 20, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const local = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(file.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
    if (name.endsWith('/')) continue
    if (packed === 0xffffffff || size === 0xffffffff || local === 0xffffffff) throw new Error('Too large a zip file')
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const data = file.subarray(start, start + packed)
    if (method !== STORED && method !== DEFLATED) throw new Error(`Cannot read ${name}`)
    const bytes = method === STORED ? data.slice() : await through(data, new DecompressionStream('deflate-raw')).catch(() => null)
    if (!bytes || bytes.length !== size || crc32(bytes) !== crc) throw new Error(`${name} is damaged`)
    entries.push({ name, bytes })
  }
  return entries
}
