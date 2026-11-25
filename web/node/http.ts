/** The part of node:http and node:https the app uses. A page cannot open a connection to an address it picked itself. */
export function get(): never {
  throw Object.assign(new Error('connect ENOTSUP'), { code: 'ENOTSUP' })
}

export default { get }
