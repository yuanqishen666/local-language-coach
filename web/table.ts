/**
 * The part of the web framework the app's routes use, without the framework. The routes register themselves here
 * as they do with Fastify, and a request is answered by calling the route it matches. Requests and answers are
 * JSON text, as they are over the network.
 */
import type { FastifyInstance } from 'fastify'

export interface Asked { method: string; path: string; body?: string }
export interface Answer { status: number; body: string }

type Request = ReturnType<typeof requestFor>
type Handler = (request: Request, reply: Reply) => unknown
type Hook = (request: Request, reply: Reply, done: (error?: unknown) => void) => unknown
type ErrorHandler = (error: unknown, request: Request, reply: Reply) => unknown
interface Route { method: string; pattern: string; steps: string[]; handler: Handler }

class Reply {
  statusCode = 200
  sent = false
  payload: unknown

  code(status: number) {
    this.statusCode = status
    return this
  }

  // No header a route sets means anything where there is no network between the page and the routes.
  header() {
    return this
  }

  send(payload?: unknown) {
    this.sent = true
    this.payload = payload
    return this
  }
}

const stepsOf = (path: string) => path.split('/').filter(Boolean)

function requestFor(asked: Asked, route: Route | undefined, steps: string[], search: string, body: unknown) {
  const params: Record<string, string> = {}
  route?.steps.forEach((step, at) => {
    if (step.startsWith(':')) params[step.slice(1)] = decodeURIComponent(steps[at])
  })
  return {
    method: asked.method,
    url: asked.path,
    params,
    query: Object.fromEntries(new URLSearchParams(search)),
    body,
    headers: { host: location.host, origin: location.origin } as Record<string, string | undefined>,
    // The page asking is the only one there is, and it is on this device.
    socket: { remoteAddress: '127.0.0.1' },
    routeOptions: { url: route?.pattern },
  }
}

/** Whether `one` names the address more exactly than `other`: where they first differ, it has the fixed word. */
function closer(one: Route, other: Route) {
  for (let at = 0; at < one.steps.length; at += 1) {
    const fixed = !one.steps[at].startsWith(':')
    if (fixed !== !other.steps[at].startsWith(':')) return fixed
  }
  return false
}

export function createRouteTable() {
  const routes: Route[] = []
  const hooks: Hook[] = []
  let failed: ErrorHandler = (error, _request, reply) => {
    reply.code((error as { statusCode?: number })?.statusCode || 500).send({ error: (error as Error)?.message || 'Unexpected error' })
  }

  const register = (method: string) => (pattern: string, options: unknown, handler?: Handler) => {
    routes.push({ method, pattern, steps: stepsOf(pattern), handler: handler || options as Handler })
  }

  const app = {
    get: register('GET'),
    post: register('POST'),
    put: register('PUT'),
    patch: register('PATCH'),
    delete: register('DELETE'),
    addHook(name: string, hook: Hook) {
      if (name === 'preHandler') hooks.push(hook)
    },
    setErrorHandler(handler: ErrorHandler) {
      failed = handler
    },
    log: { error: (issue: unknown) => console.error(issue), warn: (issue: unknown) => console.warn(issue), info() {}, debug() {} },
  }

  /** Runs the hooks one after another and then the route, each inside the one before, so what a hook sets up holds for the rest. */
  function run(request: Request, reply: Reply, route: Route) {
    return new Promise<unknown>((resolve, reject) => {
      const step = (at: number) => {
        try {
          if (at === hooks.length) return resolve(route.handler(request, reply))
          let moved = false
          const done = (error?: unknown) => {
            if (moved) return
            moved = true
            if (error) reject(error)
            else step(at + 1)
          }
          const waiting = hooks[at](request, reply, done) as Promise<unknown> | undefined
          if (typeof waiting?.then === 'function') waiting.then(() => done(), reject)
        } catch (error) {
          reject(error)
        }
      }
      step(0)
    })
  }

  async function answer(asked: Asked): Promise<Answer> {
    const [path, search = ''] = asked.path.split('?')
    const steps = stepsOf(path)
    const route = routes
      .filter((item) => item.method === asked.method && item.steps.length === steps.length && item.steps.every((step, at) => step.startsWith(':') || step === steps[at]))
      .reduce<Route | undefined>((best, item) => !best || closer(item, best) ? item : best, undefined)
    const reply = new Reply()
    let body: unknown
    try {
      body = asked.body ? JSON.parse(asked.body) : undefined
    } catch {
      return { status: 400, body: JSON.stringify({ error: 'Body is not valid JSON' }) }
    }
    const request = requestFor(asked, route, steps, search, body)
    if (!route) return { status: 404, body: JSON.stringify({ error: 'Not found' }) }
    try {
      const returned = await run(request, reply, route)
      if (!reply.sent) reply.send(returned)
    } catch (error) {
      await failed(error, request, reply)
    }
    return { status: reply.statusCode, body: reply.payload === undefined ? '' : JSON.stringify(reply.payload) }
  }

  return { app: app as unknown as FastifyInstance, answer }
}
