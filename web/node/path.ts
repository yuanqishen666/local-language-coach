/** The part of node:path the app uses. In a browser every address is written with forward slashes and starts from `/`. */

function steps(parts: string[]) {
  const kept: string[] = []
  for (const step of parts.join('/').split('/')) {
    if (!step || step === '.') continue
    if (step === '..') kept.pop()
    else kept.push(step)
  }
  return kept.join('/')
}

export function join(...parts: string[]) {
  const joined = steps(parts)
  return parts.find(Boolean)?.startsWith('/') ? `/${joined}` : joined || '.'
}

export function resolve(...parts: string[]) {
  const last = parts.findLastIndex((part) => part.startsWith('/'))
  return `/${steps(last < 0 ? parts : parts.slice(last))}`
}

export const sep = '/'

export default { join, resolve, sep }
