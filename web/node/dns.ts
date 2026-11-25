/** The part of node:dns/promises the app uses. A page cannot find out what address a name stands for. */
export async function lookup(name: string, _options?: unknown): Promise<Array<{ address: string; family: number }>> {
  throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${name}`), { code: 'ENOTFOUND' })
}
