import assert from 'node:assert/strict'
import test from 'node:test'
import { backgroundFingerprint, dynamicFingerprint, filterNovelEncounters, softPickRanked, type SceneBackgroundSeed, type SceneEncounterCandidate } from './scene-generation.js'

const background: SceneBackgroundSeed = {
  candidateId: 'bg-1', identityKey: 'neighborhood-bakery-regular', title: '面包店门口', setting: '社区面包店门口',
  partnerRole: '附近的常客', relationship: '见过几次的邻居', sharedContext: '都常来这条街', registerHint: '轻松自然',
  openAffordances: ['聊眼前看到的事'], destinationSpecificity: 'not_applicable',
  participants: [{ name: '林', role: '附近的常客', relationship: '见过几次的邻居' }],
  localStyle: { locale: 'zh-CN', register: '日常口语', relationshipDistance: '熟面孔', addressNorms: [], turnTaking: [], pragmaticNotes: [], avoidPhrases: [] },
  factPolicy: { stableFacts: ['两人见过几次'], doNotAssert: ['今天的营业时间'], asOf: '2026-11-19' }, safetyClass: 'normal',
}

function encounter(id: string, dynamicSummary: string, openingLine: string): SceneEncounterCandidate {
  return {
    candidateId: id, transientState: dynamicSummary, socialEnergy: '轻松', openingAct: '观察', initialAffordance: dynamicSummary,
    initiativeMode: 'CO_LEAD', dynamicSummary,
    setup: {
      title: '街角偶遇', category: 'neighborhood', setting: background.setting, partnerName: '林', partnerRole: background.partnerRole,
      relationship: background.relationship, tone: '自然', personalityCues: [], interests: [], currentMood: '放松', topicSeed: dynamicSummary,
      openingLine, difficulty: 'B1',
    },
  }
}

test('stable background identity ignores display title and participant name', () => {
  const renamed = { ...background, title: '巷口小店', participants: [{ ...background.participants[0], name: '周' }] }
  assert.equal(backgroundFingerprint(background), backgroundFingerprint(renamed))
})

test('runtime fingerprint changes without changing the background', () => {
  assert.notEqual(dynamicFingerprint(encounter('a', '刚下过雨，门口有积水', '刚才那阵雨来得真快。')), dynamicFingerprint(encounter('b', '有人牵着一只兴奋的小狗经过', '这只小狗每次路过都这么开心。')))
})

test('novelty filtering compares dynamic encounter and opening, not the shared background', () => {
  const fresh = encounter('fresh', '橱窗里换了一幅手写画', '他们今天把橱窗画换了，看着挺有意思。')
  const repeated = encounter('repeat', '店门口刚摆出了两盆花', '雨刚停，地上还亮亮的。')
  const filtered = filterNovelEncounters([fresh, repeated], [{ dynamicSummary: '雨后地面还湿着', openingLine: '雨刚停，地上还亮亮的。', openingAct: '观察', socialEnergy: '轻松' }])
  assert.deepEqual(filtered.map((item) => item.candidateId), ['fresh'])
})

test('soft selection keeps variety inside the best two eligible candidates', () => {
  const candidates = [encounter('one', '一', '第一句'), encounter('two', '二', '第二句'), encounter('three', '三', '第三句')]
  assert.equal(softPickRanked(candidates, ['one', 'two', 'three'], () => 0.1)?.candidateId, 'one')
  assert.equal(softPickRanked(candidates, ['one', 'two', 'three'], () => 0.9)?.candidateId, 'two')
})
