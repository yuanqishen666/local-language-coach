import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'yujian-database-choice-test-'))
process.env.NODE_ENV = 'test'
process.env.LLC_DATA_DIR = dataDirectory
const { chooseDatabaseWith, db, openDatabase, perDatabase, rows, useDatabase } = await import('./services/database.js')
type Database = ReturnType<typeof openDatabase>

const opened: Database[] = []
function open(name: string) {
  const database = openDatabase(path.join(dataDirectory, name))
  opened.push(database)
  return database
}

after(async () => {
  chooseDatabaseWith(() => undefined)
  for (const database of opened) database.close()
  db.close()
  await rm(dataDirectory, { recursive: true, force: true })
})

function addConversation(id: string) {
  const now = '2026-11-22T12:00:00.000Z'
  db.prepare(`INSERT INTO conversations (id, mode, title, created_at, updated_at) VALUES (?, 'conversation', ?, ?, ?)`).run(id, id, now, now)
}

function conversations() {
  return rows<{ id: string }>('SELECT id FROM conversations ORDER BY id').map((item) => item.id)
}

test('every query goes to the shared database until another is named for the work in hand', () => {
  addConversation('shared')
  const first = open('first.db')
  const second = open('second.db')
  assert.deepEqual(conversations(), ['shared'], 'opening other files leaves the shared one in use and untouched')

  let inHand: Database | undefined
  chooseDatabaseWith(() => inHand)
  inHand = first
  addConversation('one')
  inHand = second
  addConversation('two')
  assert.deepEqual(conversations(), ['two'])
  inHand = first
  assert.deepEqual(conversations(), ['one'])
  inHand = undefined
  assert.deepEqual(conversations(), ['shared'], 'naming nothing means the shared database')
  chooseDatabaseWith(() => undefined)
})

test('a file opened on its own has every table, and so does one the shared database is switched to', () => {
  const tables = () => rows<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'")[0].n
  const shared = tables()
  const own = open('own.db')
  chooseDatabaseWith(() => own)
  assert.equal(tables(), shared)
  chooseDatabaseWith(() => undefined)

  useDatabase(path.join(dataDirectory, 'another-learner.db'))
  assert.equal(tables(), shared)
  assert.deepEqual(conversations(), [])
  useDatabase(path.join(dataDirectory, 'app.db'))
  assert.deepEqual(conversations(), ['shared'])
})

test('work for two learners that overlaps in time keeps to its own database', async () => {
  const inHand = new AsyncLocalStorage<Database>()
  chooseDatabaseWith(() => inHand.getStore())
  const pause = () => new Promise((resolve) => setTimeout(resolve, 5))

  async function turn(id: string) {
    addConversation(`${id}-before`)
    await pause()
    addConversation(`${id}-after`)
    await pause()
    return conversations()
  }

  const [left, right] = await Promise.all([
    inHand.run(open('left.db'), () => turn('left')),
    inHand.run(open('right.db'), () => turn('right')),
  ])
  assert.deepEqual(left, ['left-after', 'left-before'])
  assert.deepEqual(right, ['right-after', 'right-before'])
  assert.deepEqual(conversations(), ['shared'])
  chooseDatabaseWith(() => undefined)
})

test('what is kept per database is one thing for each, however often it is asked for', () => {
  const underWay = perDatabase(() => new Set<string>())
  const first = open('kept-first.db')
  const second = open('kept-second.db')
  let inHand: Database | undefined
  chooseDatabaseWith(() => inHand)

  underWay().add('shared')
  inHand = first
  underWay().add('one')
  inHand = second
  assert.deepEqual([...underWay()], [])
  inHand = first
  assert.deepEqual([...underWay()], ['one'])
  inHand = undefined
  assert.deepEqual([...underWay()], ['shared'])
  chooseDatabaseWith(() => undefined)
})
