import assert from 'node:assert/strict'
import test from 'node:test'
import { selectRelevantMemories } from './context.js'

const memories = [
  { category: 'personal', key: '海边偏好', value: '喜欢安静、人少、水清的海边' },
  { category: 'learning', key: '英语学习目标', value: '希望练习日常口语' },
]

test('semantic memory keys bridge synonyms and languages for recommendations', () => {
  const selected = selectRelevantMemories(
    memories,
    'Could you recommend a seaside destination?',
    '',
    4,
    ['海边偏好'],
  )
  assert.deepEqual(selected, [memories[0]])
})

test('unrelated recent memories are not injected as context', () => {
  const selected = selectRelevantMemories(memories, 'How do I cook this pasta?', '', 4)
  assert.deepEqual(selected, [])
})

test('core memories are always present but unrelated long-term memories stay out', () => {
  const core = { id: 'core-1', category: 'personal', key: '称呼偏好', value: '喜欢被叫作 Alex', tier: 'core', importance: 0.9 }
  const unrelated = { id: 'long-1', category: 'personal', key: '海边偏好', value: '喜欢安静海边', tier: 'long_term', topic: 'travel' }
  const selected = selectRelevantMemories([unrelated, core], 'How do I cook this pasta?', '', 4)
  assert.deepEqual(selected, [core])
})

test('reply topic is a soft routing signal for long-term memory', () => {
  const beach = { id: 'beach-1', category: 'personal', key: '度假环境偏好', value: '喜欢人少水清的地方', tier: 'long_term', memoryType: 'preference', topic: 'beach' }
  const selected = selectRelevantMemories([beach], 'Can you recommend somewhere?', '', 4, [], ['beach'], 'recommendation')
  assert.deepEqual(selected, [beach])
})
