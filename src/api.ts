export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public details?: Record<string, number | string>) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Takes one request to the app's routes and brings back the status it was answered with and the JSON that came with it. */
export type Send = (method: string, path: string, body?: string) => Promise<{ status: number; body: any }>

let send: Send = async (method, path, body) => {
  const response = await fetch(`/api${path}`, { method, body, headers: body == null ? undefined : { 'content-type': 'application/json' } })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

/**
 * Requests go over the network to the server the page came from. A program that hosts the routes somewhere
 * else, such as inside the page itself, names its own way of reaching them here before the app starts.
 */
export function sendRequestsWith(next: Send) {
  send = next
}

async function request<T>(path: string, options?: { method: string; body?: string }): Promise<T> {
  const { status, body } = await send(options?.method || 'GET', path, options?.body)
  if (status < 200 || status > 299) throw new ApiError(body.error || `Request failed (${status})`, status, body.code, body.details)
  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
