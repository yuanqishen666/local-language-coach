/**
 * AsyncLocalStorage for a browser, which has none. What is stored follows the work a `run` starts across every
 * `then`: a promise's callbacks run with what was stored when they were handed over.
 *
 * A native `await` never calls `then`, so this holds only where `await` has been compiled into `then` calls,
 * which the build of the web version does for everything in its background thread (see vite.web.config.ts).
 */

type Stored = ReadonlyMap<object, unknown>

const NOTHING: Stored = new Map()
let stored = NOTHING

function keeping<In extends unknown[], Out>(callback: (...input: In) => Out) {
  const mine = stored
  return (...input: In) => {
    const before = stored
    stored = mine
    try { return callback(...input) } finally { stored = before }
  }
}

const then = Promise.prototype.then

Promise.prototype.then = function (this: Promise<unknown>, fulfilled?: any, rejected?: any) {
  // Callbacks are run from an empty stack, where nothing is stored, so one handed over with nothing needs no wrapping.
  if (stored === NOTHING) return then.call(this, fulfilled, rejected)
  return then.call(this, typeof fulfilled === 'function' ? keeping(fulfilled) : fulfilled, typeof rejected === 'function' ? keeping(rejected) : rejected)
} as typeof then

export class AsyncLocalStorage<T> {
  run<Out>(store: T, callback: () => Out): Out {
    const before = stored
    stored = new Map(before).set(this, store)
    try { return callback() } finally { stored = before }
  }

  getStore() {
    return stored.get(this) as T | undefined
  }
}
