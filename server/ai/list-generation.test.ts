import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { completedListItems, generateListInSteps, generateStructured, hasExampleShape, listBatchSize, listFromAnswer, listRequestSteps, withOutputLimitDetails } from './engine.js'
import { ProviderRequestError } from './provider.js'

function truncated(partialContent = '') {
  const error = new ProviderRequestError('cut off', 422, 'PROVIDER_TRUNCATED_RESPONSE')
  if (partialContent) Object.defineProperty(error, 'partialContent', { value: partialContent, enumerable: false })
  return error
}

test('a request is sized to what the output limit can hold', () => {
  // backgrounds (560 tokens each, at most 4), openings (400, at most 4), custom openings (300, at most 3)
  assert.deepEqual([256, 1_200, 2_000, 4_000].map((limit) => listBatchSize(limit, 560, 4)), [1, 1, 2, 4])
  assert.deepEqual([256, 1_200, 2_000, 4_000].map((limit) => listBatchSize(limit, 400, 4)), [1, 2, 3, 4])
  assert.deepEqual([256, 1_200, 2_000, 4_000].map((limit) => listBatchSize(limit, 300, 3)), [1, 2, 3, 3])
  assert.deepEqual(listRequestSteps(3), [{ count: 3, compact: false }, { count: 1, compact: true }])
})

test('a list is read whether or not the model used the expected wrapper', () => {
  const item = { title: 'one', tags: ['a'] }
  assert.deepEqual(listFromAnswer({ items: [item] }, 'items'), [item])
  assert.deepEqual(listFromAnswer([item], 'items'), [item])
  assert.deepEqual(listFromAnswer({ results: [item] }, 'items'), [item])
  assert.deepEqual(listFromAnswer(item, 'items'), [item])
  assert.deepEqual(listFromAnswer({ items: item }, 'items'), [item])
  assert.deepEqual(listFromAnswer({ items: 'none' }, 'items'), [])
  assert.deepEqual(listFromAnswer('text', 'items'), [])
  assert.deepEqual(listFromAnswer(null, 'items'), [])
})

test('a cut-off answer without the expected wrapper still gives up its finished elements', () => {
  const first = { id: 1, tags: ['a', 'b'] }
  const second = { id: 2, tags: ['c'] }
  const bare = JSON.stringify([first, second])
  assert.deepEqual(completedListItems(bare.slice(0, bare.indexOf('{"id":2') + 9), 'items'), [first])
  const renamed = JSON.stringify({ results: [first, second] })
  assert.deepEqual(completedListItems(renamed.slice(0, renamed.indexOf('{"id":2') + 9), 'items'), [first])
  const fenced = '```json\n' + bare
  assert.deepEqual(completedListItems(fenced.slice(0, fenced.indexOf('{"id":2') + 9), 'items'), [first])
  const single = JSON.stringify({ title: 'one', tags: ['a', 'b'], note: 'unfinished' })
  assert.deepEqual(completedListItems(single.slice(0, -6), 'items'), [])
})

test('only list elements that were finished survive a cut-off answer', () => {
  const first = { id: 1, note: 'brace } bracket ] and "quote" inside text', nested: { list: [{ deep: true }] } }
  const second = { id: 2, note: 'second', nested: { list: [] } }
  const full = JSON.stringify({ items: [first, second] })
  const secondStart = full.indexOf('{"id":2')

  assert.deepEqual(completedListItems(full, 'items'), [first, second])
  assert.deepEqual(completedListItems(full.slice(0, -2), 'items'), [first, second])
  assert.deepEqual(completedListItems(full.slice(0, secondStart), 'items'), [first])
  assert.deepEqual(completedListItems(full.slice(0, secondStart + 12), 'items'), [first])
  // The second element has closed a nested object but not itself.
  assert.deepEqual(completedListItems(full.slice(0, -3), 'items'), [first])
  assert.deepEqual(completedListItems(full.slice(0, 30), 'items'), [])
  assert.deepEqual(completedListItems('', 'items'), [])
  // A list under another name is read when it is what the answer opens with, and only then.
  assert.deepEqual(completedListItems(full, 'other'), [first, second])
  assert.deepEqual(completedListItems(JSON.stringify({ note: 'x', list: [first] }), 'other'), [])
  assert.deepEqual(completedListItems('```json\n' + full.slice(0, secondStart + 5), 'items'), [first])
})

test('a cut-off structured answer is used when it holds a finished element', async () => {
  const schema = z.object({ items: z.array(z.object({ id: z.number() })) })
  const task = {
    name: 'items', schema, hint: '{"items":[{"id":1}]}', temperature: 0,
    normalize: (value: unknown) => value as z.input<typeof schema>,
    usable: (value: z.output<typeof schema>) => value.items.length > 0,
  }
  const client = (partialContent: string) => ({
    id: 'test',
    outputMode: 'prompt_json' as const,
    async generate(): Promise<string> { throw truncated(partialContent) },
  })

  assert.deepEqual(await generateStructured(client('{"items":[{"id":1},{"id":'), [], { ...task, listKey: 'items' }), { items: [{ id: 1 }] })
  await assert.rejects(
    generateStructured(client('{"items":[{"id":'), [], { ...task, listKey: 'items' }),
    (error: unknown) => error instanceof ProviderRequestError && error.code === 'PROVIDER_TRUNCATED_RESPONSE',
  )
  // Tasks that did not opt in keep failing on a cut-off answer, as before.
  await assert.rejects(
    generateStructured(client('{"items":[{"id":1},{"id":'), [], task),
    (error: unknown) => error instanceof ProviderRequestError && error.code === 'PROVIDER_TRUNCATED_RESPONSE',
  )
})

test('stepped requests prefer clean items, shrink after a bad answer, and keep a last resort', async () => {
  const steps = listRequestSteps(3)
  const seen: Array<{ count: number; compact: boolean }> = []
  const run = (answers: Array<string[] | Error>, acceptable?: (item: string) => boolean) => {
    seen.length = 0
    return generateListInSteps({
      steps,
      request: async (step) => {
        seen.push(step)
        const next = answers[seen.length - 1]
        if (next instanceof Error) throw next
        return next
      },
      preferred: (item) => item.startsWith('good'),
      acceptable,
    })
  }

  assert.deepEqual(await run([['good-1', 'plain-1', 'good-2']]), ['good-1', 'good-2'])
  assert.equal(seen.length, 1)

  assert.deepEqual(await run([truncated(), ['good-1']]), ['good-1'])
  assert.deepEqual(seen, steps)

  assert.deepEqual(await run([['plain-1', 'bad-1'], ['plain-2']], (item) => item.startsWith('plain')), ['plain-1', 'plain-2'])

  await assert.rejects(run([['plain-1'], ['plain-2']]), (error: unknown) => error instanceof ProviderRequestError && error.code === 'PROVIDER_INVALID_RESPONSE')

  // The cause the user can fix is the one that is reported.
  await assert.rejects(run([truncated(), ['plain-1'], ['plain-2']]), (error: unknown) => error instanceof ProviderRequestError && error.code === 'PROVIDER_TRUNCATED_RESPONSE')

  // Key, balance, and service errors are not retried in a smaller form.
  await assert.rejects(run([new ProviderRequestError('no key', 401, 'PROVIDER_AUTH'), ['good-1']]), (error: unknown) => error instanceof ProviderRequestError && error.code === 'PROVIDER_AUTH')
  assert.equal(seen.length, 1)
})

test('a turned-down answer is followed by one request that says so, and the stated reason is what gets reported', async () => {
  const seen: Array<{ count: number; compact: boolean; rejected?: boolean }> = []
  const wrongLanguage = () => new ProviderRequestError('wrong language', 502, 'PROVIDER_WRONG_LANGUAGE')
  const run = (answers: Array<string[] | Error>) => {
    seen.length = 0
    return generateListInSteps({
      steps: listRequestSteps(3),
      request: async (step) => {
        seen.push(step)
        const next = answers[seen.length - 1]
        if (next instanceof Error) throw next
        return next
      },
      preferred: (item) => item.startsWith('good'),
      acceptable: (item) => item.startsWith('plain'),
      rejection: wrongLanguage,
    })
  }

  // The second request already carries the correction, so there is no third one.
  await assert.rejects(run([['bad-1'], ['bad-2']]), (error: unknown) => error instanceof ProviderRequestError && error.code === 'PROVIDER_WRONG_LANGUAGE')
  assert.deepEqual(seen, [{ count: 3, compact: false }, { count: 1, compact: true, rejected: true }])

  // The first answer was cut off, so the correction has not been given yet: one more request.
  assert.deepEqual(await run([truncated(), ['bad-1'], ['good-1']]), ['good-1'])
  assert.deepEqual(seen, [{ count: 3, compact: false }, { count: 1, compact: true }, { count: 1, compact: true, rejected: true }])

  // Something usable was already found; no extra request is spent on it.
  assert.deepEqual(await run([truncated(), ['plain-1']]), ['plain-1'])
  assert.equal(seen.length, 2)
})

function scriptedClient(outputMode: 'json_schema' | 'json_object' | 'prompt_json', answers: Array<string | Error>) {
  const requests: Array<{ outputMode?: string; system: string; temperature?: number }> = []
  return {
    requests,
    client: {
      id: 'test',
      outputMode,
      async generate(messages: Array<{ role: string; content: string }>, options: { outputMode?: string; temperature?: number } = {}): Promise<string> {
        requests.push({ outputMode: options.outputMode, temperature: options.temperature, system: messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n') })
        const next = answers[requests.length - 1]
        if (next instanceof Error) throw next
        return next
      },
    },
  }
}

const replySchema = z.object({ reply: z.string(), note: z.string() })
const replyTask = {
  name: 'reply', schema: replySchema, hint: '{"reply":"","note":""}', temperature: 0.5,
  normalize: (value: unknown) => {
    const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
    return { reply: typeof source.reply === 'string' ? source.reply : '', note: typeof source.note === 'string' ? source.note : '' }
  },
  usable: (value: z.output<typeof replySchema>) => Boolean(value.reply) && value.note === 'clean',
}

test('a complete answer with a blemish is retried and then kept instead of failing', async () => {
  const acceptable = (value: z.output<typeof replySchema>) => Boolean(value.reply)
  const blemished = JSON.stringify({ reply: 'hello', note: 'blemish' })

  const kept = scriptedClient('prompt_json', [blemished, blemished])
  assert.deepEqual(await generateStructured(kept.client, [], { ...replyTask, attempts: 2, acceptable }), { reply: 'hello', note: 'blemish' })
  assert.equal(kept.requests.length, 2)

  const improved = scriptedClient('prompt_json', [blemished, JSON.stringify({ reply: 'hello again', note: 'clean' })])
  assert.deepEqual(await generateStructured(improved.client, [], { ...replyTask, attempts: 2, acceptable }), { reply: 'hello again', note: 'clean' })

  // A retry that fails outright does not throw away the answer that was already good enough.
  const interrupted = scriptedClient('prompt_json', [blemished, new ProviderRequestError('busy', 503, 'PROVIDER_RATE_LIMITED')])
  assert.deepEqual(await generateStructured(interrupted.client, [], { ...replyTask, attempts: 2, acceptable }), { reply: 'hello', note: 'blemish' })

  // Without the opt-in, and for answers that are not even acceptable, the failure stays a failure.
  const strict = scriptedClient('prompt_json', [blemished, blemished])
  await assert.rejects(generateStructured(strict.client, [], { ...replyTask, attempts: 2 }), (error: unknown) => error instanceof ProviderRequestError && error.code === 'PROVIDER_INVALID_RESPONSE')
  const empty = scriptedClient('prompt_json', [JSON.stringify({ reply: '', note: '' })])
  await assert.rejects(generateStructured(empty.client, [], { ...replyTask, acceptable }), (error: unknown) => error instanceof ProviderRequestError && error.code === 'PROVIDER_INVALID_RESPONSE')
})

test('a schema that the provider refuses or does not enforce is asked again as plain JSON with the example', async () => {
  const good = JSON.stringify({ reply: 'hello', note: 'clean' })

  const refused = scriptedClient('json_schema', [new ProviderRequestError('bad schema', 422, 'PROVIDER_INVALID_REQUEST'), good])
  assert.deepEqual(await generateStructured(refused.client, [], replyTask), { reply: 'hello', note: 'clean' })
  assert.deepEqual(refused.requests.map((request) => request.outputMode), ['json_schema', 'prompt_json'])
  assert.equal(refused.requests[0].system.includes('Compact example'), false)
  assert.equal(refused.requests[1].system.includes('{"reply":"","note":""}'), true)
  // Nothing was answered yet, so the second request is a first attempt, not a correction.
  assert.equal(refused.requests[1].temperature, 0.5)

  // The provider accepted the schema and then answered with keys of its own.
  const ignored = scriptedClient('json_schema', [JSON.stringify({ text: 'hello', comment: 'clean' }), good])
  assert.deepEqual(await generateStructured(ignored.client, [], replyTask), { reply: 'hello', note: 'clean' })
  assert.deepEqual(ignored.requests.map((request) => request.outputMode), ['json_schema', 'prompt_json'])

  const unreadable = scriptedClient('json_schema', ['I could not produce that.', good])
  assert.deepEqual(await generateStructured(unreadable.client, [], replyTask), { reply: 'hello', note: 'clean' })

  // The right keys with unusable content is not a schema problem: no extra request.
  const shaped = scriptedClient('json_schema', [JSON.stringify({ reply: 'hello', note: 'blemish' }), good])
  await assert.rejects(generateStructured(shaped.client, [], replyTask), (error: unknown) => error instanceof ProviderRequestError && error.code === 'PROVIDER_INVALID_RESPONSE')
  assert.equal(shaped.requests.length, 1)

  // The rescue happens once; a request that keeps being refused is reported as such.
  const stillRefused = scriptedClient('json_schema', [new ProviderRequestError('bad', 422, 'PROVIDER_INVALID_REQUEST'), new ProviderRequestError('bad', 422, 'PROVIDER_INVALID_REQUEST')])
  await assert.rejects(generateStructured(stillRefused.client, [], replyTask), (error: unknown) => error instanceof ProviderRequestError && error.code === 'PROVIDER_INVALID_REQUEST')
  assert.equal(stillRefused.requests.length, 2)

  // JSON-object mode keeps its existing behaviour: the retry is plain JSON.
  const jsonObject = scriptedClient('json_object', ['', good].map((value) => value || new ProviderRequestError('empty', 502, 'PROVIDER_EMPTY_RESPONSE')))
  assert.deepEqual(await generateStructured(jsonObject.client, [], { ...replyTask, attempts: 2 }), { reply: 'hello', note: 'clean' })
  assert.deepEqual(jsonObject.requests.map((request) => request.outputMode), ['json_object', 'prompt_json'])
})

test('the example shape is checked at every level the example spells out', () => {
  const example = { items: [{ id: 1, tags: [] }], note: '', extra: null }
  assert.equal(hasExampleShape({ items: [{ id: 2, tags: ['a'] }], note: 'x', extra: { any: 1 } }, example), true)
  assert.equal(hasExampleShape({ items: [], note: 'x', extra: null }, example), true)
  assert.equal(hasExampleShape({ items: [{ id: 2 }], note: 'x', extra: null }, example), false)
  assert.equal(hasExampleShape({ results: [{ id: 2, tags: [] }], note: 'x', extra: null }, example), false)
  assert.equal(hasExampleShape([{ id: 2, tags: [] }], example), false)
  assert.equal(hasExampleShape({ items: null, note: 'x', extra: null }, example), true)
})

test('a cut-off error carries the current limit and the value to raise it to', () => {
  assert.deepEqual((withOutputLimitDetails(truncated(), 1_200) as ProviderRequestError).details, { maxOutputTokens: 1_200, recommendedMaxOutputTokens: 2_000 })
  assert.deepEqual((withOutputLimitDetails(truncated(), 2_000) as ProviderRequestError).details, { maxOutputTokens: 2_000, recommendedMaxOutputTokens: 4_000 })
  const other = new ProviderRequestError('bad', 502, 'PROVIDER_INVALID_RESPONSE')
  assert.equal((withOutputLimitDetails(other, 1_200) as ProviderRequestError).details, undefined)
})
