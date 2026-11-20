import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'yanxi-word-translation-test-'))
process.env.NODE_ENV = 'test'
process.env.LLC_DATA_DIR = dataDirectory
const { app } = await import('./index.js')

after(async () => {
  await app.close()
  await rm(dataDirectory, { recursive: true, force: true })
})

async function saveWord(body: Record<string, unknown>) {
  const response = await app.inject({ method: 'POST', url: '/api/words', payload: { term: 'place', meaning: 'a spot', details: {}, ...body } })
  assert.equal(response.statusCode, 200)
  return response.json().id as string
}

test('passage translation needs a saved word that has a passage', async () => {
  let response = await app.inject({ method: 'POST', url: '/api/words/missing/translation', payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 404)

  const id = await saveWord({ language: 'en', interfaceLocale: 'zh-CN' })
  response = await app.inject({ method: 'POST', url: `/api/words/${id}/translation`, payload: { interfaceLocale: 'zh-CN' } })
  assert.equal(response.statusCode, 404)
})

test('passage translation answers in the requested interface language and is cached', async () => {
  // The passage is Japanese whatever the current target language is, so a Japanese interface needs no model call.
  const passage = '駅の近くにいい店があります。毎朝生地を作っています。'
  const id = await saveWord({ term: '店', language: 'ja', interfaceLocale: 'en-US', sourceSentence: `  ${passage}  ` })

  let response = await app.inject({ method: 'POST', url: `/api/words/${id}/translation`, payload: { interfaceLocale: 'ja-JP' } })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { translation: passage, interfaceLocale: 'ja-JP', cached: false, cacheSource: 'generated' })

  response = await app.inject({ method: 'POST', url: `/api/words/${id}/translation`, payload: { interfaceLocale: 'ja-JP' } })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { translation: passage, interfaceLocale: 'ja-JP', cached: true, cacheSource: 'shared' })
})
