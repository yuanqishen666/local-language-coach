/** The part of node:sqlite the app uses, on the browser build of SQLite, so the same queries run in both places. */
import type { BindableValue, PreparedStatement } from '@sqlite.org/sqlite-wasm'
import { closeDatabaseFile, lastRowId, openDatabaseFile } from '../storage'

// The app prepares a statement at nearly every call and never frees it. Node frees those itself; here each one
// holds memory until it is finalized, so they are kept by their text and the oldest goes when there are too many.
const KEPT_STATEMENTS = 200

export class DatabaseSync {
  #handle
  #kept = new Map<string, PreparedStatement>()

  constructor(file: string) {
    this.#handle = openDatabaseFile(file)
  }

  #compiled(sql: string) {
    const found = this.#kept.get(sql)
    if (found) {
      this.#kept.delete(sql)
      this.#kept.set(sql, found)
      return found
    }
    const statement = this.#handle.prepare(sql)
    this.#kept.set(sql, statement)
    if (this.#kept.size > KEPT_STATEMENTS) {
      const [oldest, old] = this.#kept.entries().next().value!
      this.#kept.delete(oldest)
      old.finalize()
    }
    return statement
  }

  #with<T>(sql: string, params: BindableValue[], read: (statement: PreparedStatement) => T) {
    const statement = this.#compiled(sql)
    try {
      if (params.length) statement.bind(params)
      return read(statement)
    } finally {
      statement.reset(true)
    }
  }

  prepare(sql: string) {
    return {
      run: (...params: BindableValue[]) => this.#with(sql, params, (statement) => {
        while (statement.step()) { /* a write has no rows to read */ }
        return { changes: this.#handle.changes(), lastInsertRowid: lastRowId(this.#handle) }
      }),
      get: (...params: BindableValue[]) => this.#with(sql, params, (statement) => statement.step() ? statement.get({}) : undefined),
      all: (...params: BindableValue[]) => this.#with(sql, params, (statement) => {
        const rows = []
        while (statement.step()) rows.push(statement.get({}))
        return rows
      }),
    }
  }

  exec(sql: string) {
    // The private file area has no shared memory for a write-ahead log, and the app asks for one when it creates its tables.
    this.#handle.exec(sql.replace(/PRAGMA\s+journal_mode\s*=\s*WAL\s*;?/giu, ''))
  }

  close() {
    for (const statement of this.#kept.values()) statement.finalize()
    this.#kept.clear()
    closeDatabaseFile(this.#handle)
  }
}
