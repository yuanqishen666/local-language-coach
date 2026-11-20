import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CEFR_LEVELS, MAX_STEP, STEP_COUNT, difficultyProfile, parseLevel, replyStep, scoreOfStep, startingDifficulty,
  stepCode, stepForPrompt, stepFromScore, stepOf, stepParts, type ConversationDifficulty, type ConversationVerdict,
} from '../shared/proficiency.js'
import { TARGET_LANGUAGES } from '../shared/locales.js'
import {
  abilityFromAnswers, conversationStats, decideAdjustment, helpLowersDifficulty, judgeConversation, lowerConversation,
  placementOutcome, tuneConversation, updateAbility, type AssessedConversation, type PlacementAnswer, type TurnSignal,
} from './proficiency.js'
import { checkReplyDifficulty, measureText, rankOf, textLength, wordRanks } from './proficiency-text.js'
import { difficultyIssueText, levelCode, levelName, materialDifficultyRule, replyDifficultyRules, requestStep } from './ai/level.js'

// ---------------------------------------------------------------------------------------------
// The scale

test('the scale has six levels of three steps and converts both ways', () => {
  assert.equal(STEP_COUNT, 18)
  assert.equal(stepOf('A1', 'low'), 0)
  assert.equal(stepOf('B1'), 7)
  assert.equal(stepOf('C2', 'high'), MAX_STEP)
  for (let step = 0; step <= MAX_STEP; step += 1) {
    assert.equal(stepFromScore(scoreOfStep(step)), step)
    const { level, part } = stepParts(step)
    assert.equal(stepOf(level, part), step)
  }
  assert.equal(stepFromScore(0), 0)
  assert.equal(stepFromScore(100), MAX_STEP)
  assert.equal(stepFromScore(-5), 0)
})

test('levels are read from the forms people and settings write them in', () => {
  assert.equal(parseLevel('B1'), stepOf('B1'))
  assert.equal(parseLevel(' b2+ '), stepOf('B2', 'high'))
  assert.equal(parseLevel('A2-'), stepOf('A2', 'low'))
  assert.equal(parseLevel('C1 high'), stepOf('C1', 'high'))
  assert.equal(parseLevel('fluent'), undefined)
  assert.equal(parseLevel(''), undefined)
  assert.equal(parseLevel(undefined), undefined)
  assert.equal(stepCode(stepOf('B1', 'high')), 'B1+')
  assert.equal(stepCode(stepOf('B1')), 'B1')
  assert.equal(stepCode(stepOf('B1', 'low')), 'B1-')
  assert.match(stepForPrompt(stepOf('A2', 'low')), /^A2 \(lower/)
})

test('every step asks for more than the one before it, in every learning language', () => {
  for (const language of TARGET_LANGUAGES) {
    let previous = difficultyProfile(0, language.code)
    for (let step = 1; step <= MAX_STEP; step += 1) {
      const current = difficultyProfile(step, language.code)
      assert.ok(current.maxSentenceLength >= previous.maxSentenceLength, `${language.code} sentence length at ${step}`)
      assert.ok(current.maxSentences >= previous.maxSentences, `${language.code} sentences at ${step}`)
      assert.ok(current.speechRateFactor >= previous.speechRateFactor, `${language.code} speech rate at ${step}`)
      assert.ok(current.expectedTurnLength >= previous.expectedTurnLength, `${language.code} turn length at ${step}`)
      assert.ok(current.expectedErrorsPer100 <= previous.expectedErrorsPer100, `${language.code} errors at ${step}`)
      if (current.commonRank > 0) assert.ok(current.commonRank >= previous.commonRank, `${language.code} vocabulary at ${step}`)
      previous = current
    }
    assert.ok(difficultyProfile(stepOf('A1'), language.code).maxSentenceLength < difficultyProfile(stepOf('B2'), language.code).maxSentenceLength)
  }
})

test('Chinese and Japanese are measured in characters, the others in words', () => {
  assert.equal(difficultyProfile(7, 'zh').unit, 'characters')
  assert.equal(difficultyProfile(7, 'ja').unit, 'characters')
  for (const code of ['en', 'es', 'fr', 'de', 'ko', 'it', 'pt', 'hi']) assert.equal(difficultyProfile(7, code).unit, 'words')
  assert.ok(difficultyProfile(7, 'zh').maxSentenceLength > difficultyProfile(7, 'en').maxSentenceLength)
  assert.equal(textLength('我昨天去了市场。', 'zh'), 7)
  assert.equal(textLength('I went to the market.', 'en'), 5)
})

test('vocabulary stops being limited at C2', () => {
  assert.ok(difficultyProfile(stepOf('C1', 'high'), 'en').commonRank > 0)
  assert.equal(difficultyProfile(stepOf('C2', 'low'), 'en').commonRank, 0)
})

// ---------------------------------------------------------------------------------------------
// Reading a reply

const samples: Record<string, { easy: string; hard: string }> = {
  en: { easy: 'I went to the market this morning and bought some apples. Do you like fruit? My sister says the red ones are sweeter.', hard: 'Notwithstanding the committee’s reservations, the proposal was ratified after a protracted deliberation that exposed deep ideological rifts.' },
  es: { easy: 'Esta mañana fui al mercado y compré unas manzanas. ¿Te gusta la fruta? Mi hermana dice que las rojas son más dulces.', hard: 'Pese a las reticencias del comité, la propuesta fue ratificada tras una deliberación prolongada que evidenció profundas fisuras ideológicas.' },
  fr: { easy: 'Ce matin, je suis allé au marché et j’ai acheté des pommes. Tu aimes les fruits ? Ma sœur dit que les rouges sont plus sucrées.', hard: 'Nonobstant les réticences du comité, la proposition fut entérinée au terme de délibérations laborieuses révélant de profonds clivages idéologiques.' },
  de: { easy: 'Heute Morgen bin ich auf den Markt gegangen und habe Äpfel gekauft. Magst du Obst? Meine Schwester sagt, die roten sind süßer.', hard: 'Ungeachtet der Vorbehalte des Ausschusses wurde der Vorschlag nach langwierigen Beratungen ratifiziert, die tiefe ideologische Verwerfungen offenlegten.' },
  it: { easy: 'Stamattina sono andato al mercato e ho comprato delle mele. Ti piace la frutta? Mia sorella dice che quelle rosse sono più dolci.', hard: 'Nonostante le riserve del comitato, la proposta è stata ratificata dopo una deliberazione estenuante che ha palesato profonde fratture ideologiche.' },
  pt: { easy: 'Hoje de manhã fui ao mercado e comprei umas maçãs. Você gosta de fruta? Minha irmã diz que as vermelhas são mais doces.', hard: 'Não obstante as ressalvas do comitê, a proposta foi ratificada após uma deliberação morosa que escancarou profundas cisões ideológicas.' },
  hi: { easy: 'आज सुबह मैं बाज़ार गया और कुछ सेब खरीदे। क्या तुम्हें फल पसंद हैं? मेरी बहन कहती है कि लाल वाले ज़्यादा मीठे होते हैं।', hard: 'समिति की आपत्तियों के बावजूद दीर्घ विचार-विमर्श के पश्चात प्रस्ताव का अनुसमर्थन किया गया, जिससे गहन वैचारिक मतभेद उजागर हुए।' },
  zh: { easy: '今天早上我去了市场，买了一些苹果。你喜欢吃水果吗？我姐姐说红的更甜。', hard: '尽管委员会心存疑虑，该提案仍在旷日持久的审议后获得批准，这场审议暴露了深刻的意识形态裂痕。' },
  ja: { easy: '今朝、市場に行ってりんごを買いました。果物は好きですか。姉は赤いのがもっと甘いと言っています。', hard: '委員会の懸念にもかかわらず、長期にわたる審議の末に提案は承認され、深刻なイデオロギー的亀裂が露呈した。' },
  ko: { easy: '오늘 아침에 시장에 가서 사과를 샀어요. 과일 좋아해요? 언니는 빨간 것이 더 달다고 해요.', hard: '위원회의 우려에도 불구하고 그 제안은 장기간의 심의 끝에 비준되었으며 깊은 이념적 균열을 드러냈다.' },
}

test('a word list is packaged for every learning language', () => {
  for (const language of TARGET_LANGUAGES) {
    const ranks = wordRanks(language.code)
    assert.ok(ranks && ranks.size > 20_000, `${language.code} word list`)
    assert.ok(samples[language.code], `${language.code} sample`)
  }
  assert.equal(wordRanks('xx'), null)
  assert.equal(wordRanks('../en'), null)
})

test('an everyday reply passes at A2 and a formal one is sent back, in every learning language', () => {
  for (const language of TARGET_LANGUAGES) {
    const profile = difficultyProfile(stepOf('A2'), language.code)
    const easy = checkReplyDifficulty(samples[language.code].easy, language.code, profile)
    assert.deepEqual(easy.issues, [], `${language.code} everyday reply: ${JSON.stringify(easy.measure)}`)
    assert.ok(easy.measure.vocabularyChecked, `${language.code} vocabulary checked`)
    const hard = checkReplyDifficulty(samples[language.code].hard, language.code, profile)
    const kinds = hard.issues.map((issue) => issue.kind)
    assert.ok(kinds.includes('sentence_length'), `${language.code} long sentence: ${JSON.stringify(hard.measure)}`)
    assert.ok(kinds.includes('vocabulary'), `${language.code} rare words: ${JSON.stringify(hard.measure)}`)
    for (const issue of hard.issues) assert.ok(difficultyIssueText(issue).length > 20)
  }
})

test('the formal reply is within reach at C1 and unchecked for vocabulary at C2', () => {
  for (const language of TARGET_LANGUAGES) {
    const c2 = checkReplyDifficulty(samples[language.code].hard, language.code, difficultyProfile(stepOf('C2'), language.code))
    assert.deepEqual(c2.issues, [], `${language.code} at C2`)
    assert.equal(c2.measure.vocabularyChecked, false)
  }
})

test('words are found the way each language writes them', () => {
  // French elision and English possessives are judged by the word that carries the meaning.
  assert.ok((rankOf('j’ai', 'fr') || 0) > 0)
  assert.equal(rankOf("committee's", 'en'), rankOf('committee', 'en'))
  // A Chinese word the list lacks falls back to its characters.
  assert.ok((rankOf('去了', 'zh') || 0) > 0)
  // Japanese endings written in hiragana are grammar, and a stem is found with its ending.
  assert.equal(rankOf('にもかかわらず', 'ja'), 1)
  assert.ok((rankOf('言', 'ja', 'って') || 99_999) < 2_000)
  // Korean words are found by their stem, with a fused ending opened up.
  assert.equal(rankOf('시장에', 'ko'), rankOf('시장', 'ko'))
  assert.equal(rankOf('드러냈다', 'ko'), rankOf('드러내', 'ko'))
  assert.equal(rankOf('시장', 'ko'), rankOf('시장에', 'ko'))
  assert.ok((rankOf('갔다', 'ko') || 0) > 0)
  // One syllable out of three says too little, so the word is left unjudged rather than called rare.
  assert.equal(rankOf('샀어요', 'ko'), undefined)
  assert.equal(rankOf('zzzzqqq', 'en'), undefined)
})

test('names and the learner’s own words are not counted as rare', () => {
  const profile = difficultyProfile(stepOf('A1'), 'en')
  const reply = 'We met Bartholomew and Anastasia in Ljubljana, near the cathedral, under the aqueduct.'
  const plain = measureText(reply, 'en', { commonRank: profile.commonRank })
  assert.ok(!plain.rareWords.includes('Bartholomew') && !plain.rareWords.includes('Ljubljana'))
  assert.ok(plain.rareWords.includes('cathedral') && plain.rareWords.includes('aqueduct'))
  const known = measureText(reply, 'en', { commonRank: profile.commonRank, known: new Set(['cathedral', 'aqueduct']) })
  assert.deepEqual(known.rareWords, [])
})

test('a language without a word list is still checked for length', () => {
  const profile = difficultyProfile(stepOf('A1'), 'sv')
  const long = 'Jag gick till marknaden i morse och köpte några äpplen eftersom min syster säger att de röda är mycket sötare än de gröna.'
  const result = checkReplyDifficulty(long, 'sv', profile)
  assert.equal(result.measure.vocabularyChecked, false)
  assert.deepEqual(result.issues.map((issue) => issue.kind), ['sentence_length'])
})

test('the prompt states limits for the step, not a bare level name', () => {
  for (const language of TARGET_LANGUAGES) {
    const config = { learning: { targetLanguage: language.name, targetLanguageCode: language.code, proficiency: 'B1', difficultyStep: stepOf('A2', 'high') } }
    assert.equal(requestStep(config), stepOf('A2', 'high'))
    assert.equal(levelCode(config), 'A2+')
    assert.match(levelName(config), /^A2 \(upper/)
    const rules = replyDifficultyRules(config).join('\n')
    const profile = difficultyProfile(stepOf('A2', 'high'), language.code)
    assert.ok(rules.includes(`${profile.maxSentenceLength} ${profile.unit}`), `${language.code} length in prompt`)
    assert.ok(rules.includes(`at most ${profile.maxSentences} sentence`))
    assert.ok(rules.includes(language.name))
    assert.ok(materialDifficultyRule(config, 'openingLine').startsWith('openingLine is written for a learner at A2'))
  }
  // Without a step the level chosen in settings applies; an unreadable one falls back to B1.
  assert.equal(requestStep({ learning: { targetLanguage: 'English', targetLanguageCode: 'en', proficiency: 'C1' } }), stepOf('C1'))
  assert.equal(requestStep({ learning: { targetLanguage: 'English', targetLanguageCode: 'en', proficiency: '' } }), stepOf('B1'))
})

// ---------------------------------------------------------------------------------------------
// Inside a conversation

function turn(overrides: Partial<TurnSignal> = {}): TurnSignal {
  return { length: 20, meaningErrors: 0, naturalnessErrors: 0, nonTarget: false, lookups: 0, translated: false, simpler: 0, slower: 0, hints: 0, answered: true, ...overrides }
}

test('the first two replies are one step easier, then the conversation runs at its difficulty', () => {
  let state = startingDifficulty(stepOf('B1'))
  assert.equal(replyStep(state), stepOf('B1') - 1)
  state = tuneConversation(state, turn({ length: 3 }), 'en')
  assert.equal(replyStep(state), stepOf('B1') - 1)
  state = tuneConversation(state, turn({ length: 3 }), 'en')
  assert.equal(replyStep(state), stepOf('B1'))
  // At the bottom of the scale there is nothing easier to warm up with.
  assert.equal(replyStep(startingDifficulty(0)), 0)
})

test('three long clean turns in a row raise the conversation one step, and no further', () => {
  let state: ConversationDifficulty = { base: stepOf('B1'), offset: 0, turns: 2, easyTurns: 0 }
  state = tuneConversation(state, turn(), 'en')
  state = tuneConversation(state, turn(), 'en')
  assert.equal(state.offset, 0)
  state = tuneConversation(state, turn(), 'en')
  assert.equal(state.offset, 1)
  for (let index = 0; index < 9; index += 1) state = tuneConversation(state, turn(), 'en')
  assert.equal(state.offset, 1)
  assert.equal(replyStep(state), stepOf('B1') + 1)
})

test('a short turn, an error that changes the meaning, or a lookup breaks the run', () => {
  for (const interruption of [turn({ length: 2 }), turn({ meaningErrors: 1 }), turn({ lookups: 1 }), turn({ hints: 1 })]) {
    let state: ConversationDifficulty = { base: stepOf('B1'), offset: 0, turns: 2, easyTurns: 0 }
    state = tuneConversation(state, turn(), 'en')
    state = tuneConversation(state, turn(), 'en')
    state = tuneConversation(state, interruption, 'en')
    state = tuneConversation(state, turn(), 'en')
    assert.equal(state.offset, 0)
  }
  // Wording that is merely unnatural does not hold the learner back.
  let state: ConversationDifficulty = { base: stepOf('B1'), offset: 0, turns: 2, easyTurns: 0 }
  for (let index = 0; index < 3; index += 1) state = tuneConversation(state, turn({ naturalnessErrors: 2 }), 'en')
  assert.equal(state.offset, 1)
})

test('answering in another language lowers the next reply at once, down to two steps', () => {
  let state: ConversationDifficulty = { base: stepOf('B1'), offset: 0, turns: 4, easyTurns: 2 }
  state = tuneConversation(state, turn({ nonTarget: true, length: 0 }), 'en')
  assert.equal(state.offset, -1)
  assert.equal(state.easyTurns, 0)
  state = tuneConversation(state, turn({ nonTarget: true, length: 0 }), 'en')
  state = tuneConversation(state, turn({ nonTarget: true, length: 0 }), 'en')
  assert.equal(state.offset, -2)
  assert.equal(replyStep(state), stepOf('B1') - 2)
})

test('help on a line lowers the difficulty once and is not counted again with the answer', () => {
  assert.equal(helpLowersDifficulty('simpler', { lookups: 0 }), true)
  assert.equal(helpLowersDifficulty('translate', { lookups: 0 }), true)
  assert.equal(helpLowersDifficulty('lookup', { lookups: 1 }), false)
  assert.equal(helpLowersDifficulty('lookup', { lookups: 2 }), true)
  assert.equal(helpLowersDifficulty('slower', { lookups: 5 }), false)
  assert.equal(helpLowersDifficulty('hint', { lookups: 5 }), false)
  const lowered = lowerConversation({ base: 7, offset: 0, turns: 4, easyTurns: 2 })
  assert.deepEqual(lowered, { base: 7, offset: -1, turns: 4, easyTurns: 0 })
  const after = tuneConversation(lowered, turn({ nonTarget: true, length: 0, simpler: 1 }), 'en', true)
  assert.equal(after.offset, -1)
  assert.equal(lowerConversation({ base: 7, offset: -2, turns: 4, easyTurns: 0 }).offset, -2)
})

// ---------------------------------------------------------------------------------------------
// One conversation

function conversation(count: number, overrides: Partial<TurnSignal> = {}) {
  return Array.from({ length: count }, () => turn(overrides))
}

test('a conversation under five turns is not counted', () => {
  const stats = conversationStats(conversation(4), 'en')
  assert.equal(judgeConversation(stats, stepOf('B1'), 'en').valid, false)
  assert.equal(judgeConversation(conversationStats(conversation(5), 'en'), stepOf('B1'), 'en').valid, true)
  // Lines the learner read but did not answer do not make a conversation longer.
  const unanswered = [...conversation(4), turn({ answered: false, length: 0 })]
  assert.equal(judgeConversation(conversationStats(unanswered, 'en'), stepOf('B1'), 'en').valid, false)
})

test('long clean answers with no help read as easy', () => {
  const stats = conversationStats(conversation(8, { length: 18 }), 'en')
  assert.equal(stats.errorsPer100, 0)
  assert.equal(stats.strainPer10, 0)
  assert.deepEqual(judgeConversation(stats, stepOf('B1'), 'en'), { valid: true, verdict: 'easy' })
})

test('ordinary answers with the odd error and lookup read as about right', () => {
  const signals = [...conversation(5, { length: 12 }), turn({ length: 12, meaningErrors: 1, lookups: 1 }), turn({ length: 9, lookups: 1 }), turn({ length: 12 })]
  const stats = conversationStats(signals, 'en')
  assert.deepEqual(judgeConversation(stats, stepOf('B1'), 'en'), { valid: true, verdict: 'fit' })
  // Short answers alone are not a sign of trouble, only of not being stretched.
  assert.equal(judgeConversation(conversationStats(conversation(8, { length: 5 }), 'en'), stepOf('B1'), 'en').verdict, 'fit')
})

test('many errors, much help, another language or two steps down read as hard', () => {
  const judge = (signals: TurnSignal[], offset = 0) => judgeConversation(conversationStats(signals, 'en', offset), stepOf('B1'), 'en').verdict
  assert.equal(judge(conversation(6, { length: 10, meaningErrors: 1 })), 'hard')
  assert.equal(judge(conversation(6, { length: 12, lookups: 1 })), 'hard')
  assert.equal(judge([...conversation(4, { length: 12 }), ...conversation(2, { nonTarget: true, length: 0 })]), 'hard')
  assert.equal(judge(conversation(6, { length: 12 }), -2), 'hard')
  // Two slips in a long conversation are not enough to call it hard.
  assert.notEqual(judge([...conversation(10, { length: 15 }), ...conversation(2, { length: 15, meaningErrors: 1 })]), 'hard')
})

test('one slip or one lookup is forgiven only in a longer conversation', () => {
  const judge = (signals: TurnSignal[]) => judgeConversation(conversationStats(signals, 'en'), stepOf('C1'), 'en').verdict
  const long = [...conversation(7, { length: 30 }), turn({ length: 30, lookups: 1, meaningErrors: 1 })]
  assert.equal(judge(long), 'easy')
  const short = [...conversation(4, { length: 30 }), turn({ length: 30, lookups: 1 })]
  assert.equal(judge(short), 'fit')
  const twice = [...conversation(6, { length: 30 }), ...conversation(2, { length: 30, lookups: 1 })]
  assert.equal(judge(twice), 'fit')
})

test('rates are stated per word in languages counted in characters', () => {
  const english = conversationStats(conversation(6, { length: 20, meaningErrors: 1 }), 'en')
  const chinese = conversationStats(conversation(6, { length: 34, meaningErrors: 1 }), 'zh')
  assert.equal(english.errorsPer100, 5)
  assert.equal(chinese.errorsPer100, 5)
})

// ---------------------------------------------------------------------------------------------
// Across conversations

function assessed(verdicts: ConversationVerdict[], options: { baseStep?: number; estimateStep?: number; expression?: number | null; start?: number } = {}): AssessedConversation[] {
  // Newest first, one a day.
  return verdicts.map((verdict, index) => ({
    conversationId: `c${index}`,
    baseStep: options.baseStep ?? 7,
    estimateStep: options.estimateStep ?? 7,
    verdict,
    expressionStep: options.expression === undefined ? null : options.expression,
    assessedAt: new Date(Date.UTC(2026, 10, (options.start ?? 20) - index)).toISOString(),
  }))
}

const b1 = { score: scoreOfStep(7), step: 7, workingStep: 7, locked: false }

test('three easy conversations raise the difficulty one step; two are not enough', () => {
  assert.deepEqual(decideAdjustment({ profile: b1, assessments: assessed(['easy', 'easy']), difficultyChangedAt: null, estimateChangedAt: null }), [])
  const changes = decideAdjustment({ profile: b1, assessments: assessed(['easy', 'easy', 'easy']), difficultyChangedAt: null, estimateChangedAt: null })
  assert.deepEqual(changes.map((change) => [change.kind, change.fromStep, change.toStep, change.reason]), [['difficulty', 7, 8, 'easy_streak']])
  assert.deepEqual(decideAdjustment({ profile: b1, assessments: assessed(['easy', 'fit', 'easy', 'easy']), difficultyChangedAt: null, estimateChangedAt: null }), [])
})

test('two hard conversations lower the difficulty one step: down is quicker than up', () => {
  const changes = decideAdjustment({ profile: b1, assessments: assessed(['hard', 'hard', 'easy']), difficultyChangedAt: null, estimateChangedAt: null })
  assert.deepEqual(changes.map((change) => [change.kind, change.fromStep, change.toStep, change.reason]), [['difficulty', 7, 6, 'hard_streak']])
  assert.deepEqual(decideAdjustment({ profile: b1, assessments: assessed(['hard', 'fit', 'hard']), difficultyChangedAt: null, estimateChangedAt: null }), [])
  assert.deepEqual(decideAdjustment({ profile: { ...b1, step: 0, workingStep: 0, score: scoreOfStep(0) }, assessments: assessed(['hard', 'hard'], { baseStep: 0, estimateStep: 0 }), difficultyChangedAt: null, estimateChangedAt: null }), [])
})

test('conversations that already moved the difficulty are not used again', () => {
  const assessments = assessed(['easy', 'easy', 'easy'])
  const afterTheSecond = assessments[1].assessedAt
  assert.deepEqual(decideAdjustment({ profile: b1, assessments, difficultyChangedAt: afterTheSecond, estimateChangedAt: null }), [])
  assert.deepEqual(decideAdjustment({ profile: b1, assessments: assessed(['hard', 'hard']), difficultyChangedAt: afterTheSecond, estimateChangedAt: null }), [])
})

test('the difficulty never runs more than one step ahead of the estimate', () => {
  const ahead = { ...b1, workingStep: 8 }
  const changes = decideAdjustment({ profile: ahead, assessments: assessed(['easy', 'easy'], { baseStep: 8 }), difficultyChangedAt: null, estimateChangedAt: null })
  assert.deepEqual(changes, [])
  // Three easy conversations above the estimate, with nothing read from the learner's lines yet: still held.
  const held = decideAdjustment({ profile: ahead, assessments: assessed(['easy', 'easy', 'easy'], { baseStep: 8 }), difficultyChangedAt: null, estimateChangedAt: null })
  assert.deepEqual(held, [])
})

test('the estimate rises after three conversations above it that the learner’s own lines confirm', () => {
  const ahead = { ...b1, workingStep: 8 }
  const confirmed = decideAdjustment({ profile: ahead, assessments: assessed(['fit', 'easy', 'fit'], { baseStep: 8, expression: 8 }), difficultyChangedAt: null, estimateChangedAt: null })
  assert.deepEqual(confirmed.map((change) => [change.kind, change.fromStep, change.toStep, change.reason]), [['estimate', 7, 8, 'sustained_above']])
  const unconfirmed = decideAdjustment({ profile: ahead, assessments: assessed(['fit', 'easy', 'fit'], { baseStep: 8, expression: 6 }), difficultyChangedAt: null, estimateChangedAt: null })
  assert.deepEqual(unconfirmed, [])
  const oneHard = decideAdjustment({ profile: ahead, assessments: assessed(['fit', 'hard', 'fit'], { baseStep: 8, expression: 9 }), difficultyChangedAt: null, estimateChangedAt: null })
  assert.deepEqual(oneHard, [])
  const notAbove = decideAdjustment({ profile: b1, assessments: assessed(['fit', 'fit', 'fit'], { baseStep: 7, expression: 9 }), difficultyChangedAt: null, estimateChangedAt: null })
  assert.deepEqual(notAbove, [])
})

test('without a reading of the learner’s lines the estimate waits for five conversations', () => {
  const ahead = { ...b1, workingStep: 8 }
  assert.deepEqual(decideAdjustment({ profile: ahead, assessments: assessed(['fit', 'fit', 'fit', 'fit'], { baseStep: 8 }), difficultyChangedAt: null, estimateChangedAt: null }), [])
  const changes = decideAdjustment({ profile: ahead, assessments: assessed(['fit', 'fit', 'fit', 'fit', 'fit'], { baseStep: 8 }), difficultyChangedAt: null, estimateChangedAt: null })
  assert.deepEqual(changes.map((change) => [change.kind, change.fromStep, change.toStep]), [['estimate', 7, 8]])
})

test('an easy run above the estimate lifts the estimate and the difficulty together', () => {
  const ahead = { ...b1, workingStep: 8 }
  const changes = decideAdjustment({ profile: ahead, assessments: assessed(['easy', 'easy', 'easy'], { baseStep: 8, expression: 9 }), difficultyChangedAt: null, estimateChangedAt: null })
  assert.deepEqual(changes.map((change) => [change.kind, change.fromStep, change.toStep]), [['estimate', 7, 8], ['difficulty', 8, 9]])
})

test('an estimate left two steps above the difficulty follows it down', () => {
  const profile = { ...b1, workingStep: 6 }
  const changes = decideAdjustment({ profile, assessments: assessed(['hard', 'hard'], { baseStep: 6 }), difficultyChangedAt: null, estimateChangedAt: null })
  assert.deepEqual(changes.map((change) => [change.kind, change.fromStep, change.toStep, change.reason]), [['difficulty', 6, 5, 'hard_streak'], ['estimate', 7, 6, 'follow_difficulty']])
})

test('a locked level is observed and never moved', () => {
  const locked = { ...b1, locked: true }
  assert.deepEqual(decideAdjustment({ profile: locked, assessments: assessed(['easy', 'easy', 'easy']), difficultyChangedAt: null, estimateChangedAt: null }), [])
  assert.deepEqual(decideAdjustment({ profile: locked, assessments: assessed(['hard', 'hard']), difficultyChangedAt: null, estimateChangedAt: null }), [])
})

// ---------------------------------------------------------------------------------------------
// The placement test

test('each answer moves the running estimate less than the one before', () => {
  const item = { step: 7, correct: true }
  const first = updateAbility(7, item, 0) - 7
  const third = updateAbility(7, item, 2) - 7
  const eighth = updateAbility(7, item, 7) - 7
  assert.ok(first > third && third > eighth && eighth > 0)
  assert.ok(first >= 2 && first <= 4, `first move ${first}`)
  assert.ok(updateAbility(7, { step: 7, correct: false }, 0) < 7)
  assert.ok(updateAbility(17, { step: 16, correct: true }, 0) <= MAX_STEP + 1)
  assert.ok(updateAbility(0, { step: 1, correct: false }, 0) >= -1)
})

test('answers right below a level and wrong above it place the learner between', () => {
  const answers: PlacementAnswer[] = [
    { step: 4, correct: true }, { step: 7, correct: true }, { step: 10, correct: false }, { step: 7, correct: true }, { step: 10, correct: false },
  ]
  const ability = abilityFromAnswers(answers, 4)
  assert.ok(ability > 6 && ability < 10.5, `ability ${ability}`)
  assert.ok(abilityFromAnswers(answers.map((answer) => ({ ...answer, correct: true })), 4) > ability)
  assert.ok(abilityFromAnswers(answers.map((answer) => ({ ...answer, correct: false })), 4) < 4)
  assert.equal(abilityFromAnswers([], 7), 7)
})

test('the result weighs expression half, reading three tenths, listening two tenths', () => {
  const right = (step: number): PlacementAnswer => ({ step, correct: true })
  const outcome = placementOutcome({
    reading: [right(4), right(7), { step: 10, correct: false }, right(7), { step: 10, correct: false }],
    listening: [right(7), { step: 10, correct: false }],
    expression: [6, 7, 8],
    vocabulary: [7, 7, 8],
    grammar: [6, 6, 7],
    startStep: 4,
  })
  const { reading, listening, expression } = outcome.parts
  assert.ok(reading !== null && listening !== null && expression === 7)
  const exact = reading * 0.3 + listening * 0.2 + expression * 0.5
  assert.equal(outcome.step, stepFromScore((exact + 0.5) * (100 / 18)))
  assert.equal(outcome.answered, 10)
  assert.equal(outcome.confidence, 'high')
  assert.equal(outcome.skills.grammar, 19 / 3)
  assert.ok(Math.abs((outcome.skills.vocabulary || 0) - 22 / 3) < 1e-9)
})

test('without listening its weight goes to the other two in proportion', () => {
  const outcome = placementOutcome({ reading: [{ step: 7, correct: true }, { step: 10, correct: false }, { step: 7, correct: true }, { step: 10, correct: true }, { step: 13, correct: false }], listening: [], expression: [10, 10, 10], startStep: 7 })
  const reading = outcome.parts.reading as number
  const exact = (reading * 0.3 + 10 * 0.5) / 0.8
  assert.equal(outcome.parts.listening, null)
  assert.equal(outcome.step, stepFromScore((exact + 0.5) * (100 / 18)))
  assert.equal(outcome.skills.listening, undefined)
})

test('a test left early or a part left out gives a result with low confidence', () => {
  const early = placementOutcome({ reading: [{ step: 7, correct: true }, { step: 10, correct: false }], listening: [], expression: [], startStep: 7, partial: true })
  assert.equal(early.confidence, 'low')
  assert.ok(early.step >= 4 && early.step <= 10)
  const nothing = placementOutcome({ reading: [], listening: [], expression: [], startStep: 7, partial: true })
  assert.equal(nothing.step, 7)
  assert.equal(nothing.confidence, 'low')
  // Understanding and expression that disagree by more than a level: not high.
  const apart = placementOutcome({
    reading: Array.from({ length: 5 }, () => ({ step: 13, correct: true })), listening: [{ step: 13, correct: true }, { step: 13, correct: true }],
    expression: [4, 4, 4], startStep: 7,
  })
  assert.equal(apart.confidence, 'medium')
})

// ---------------------------------------------------------------------------------------------
// A simulated learner

/** A small generator so that the simulation gives the same result every run. */
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

function simulatePlacement(trueStep: number, startStep: number, random: () => number) {
  const levelSteps = CEFR_LEVELS.map((level) => stepOf(level))
  const nearest = (ability: number) => levelSteps.reduce((best, step) => (Math.abs(step - ability) < Math.abs(best - ability) ? step : best))
  const chance = (itemStep: number) => 0.25 + 0.75 / (1 + Math.exp(-0.9 * (trueStep - itemStep)))
  let ability = startStep
  const reading: PlacementAnswer[] = []
  const listening: PlacementAnswer[] = []
  for (let index = 0; index < 7; index += 1) {
    const step = nearest(ability)
    const answer = { step, correct: random() < chance(step) }
    ;(index < 5 ? reading : listening).push(answer)
    ability = updateAbility(ability, answer, index)
  }
  // The model's reading of open answers is right to within about a step.
  const expression = [0, 1, 2].map(() => Math.max(0, Math.min(MAX_STEP, trueStep + Math.round((random() - 0.5) * 3))))
  return placementOutcome({ reading, listening, expression, startStep })
}

test('simulated learners: the placement test lands within a level of the truth', () => {
  const random = seeded(20261120)
  let total = 0
  let within = 0
  let error = 0
  for (const trueStep of [1, 4, 7, 10, 13, 16]) {
    for (const startStep of [4, 7, 13]) {
      for (let run = 0; run < 40; run += 1) {
        const outcome = simulatePlacement(trueStep, startStep, random)
        total += 1
        error += Math.abs(outcome.step - trueStep)
        if (Math.abs(outcome.step - trueStep) <= 3) within += 1
      }
    }
  }
  assert.ok(within / total >= 0.9, `within a level: ${within}/${total}`)
  assert.ok(error / total <= 2, `mean error in steps: ${(error / total).toFixed(2)}`)
})

/** How a learner whose real level is `trueStep` does in a conversation held at `baseStep`. */
function simulateConversation(trueStep: number, baseStep: number, random: () => number): ConversationVerdict {
  const gap = baseStep - trueStep
  const expected = difficultyProfile(baseStep, 'en')
  const own = difficultyProfile(Math.max(0, Math.min(MAX_STEP, trueStep)), 'en')
  const signals: TurnSignal[] = []
  let state = startingDifficulty(baseStep)
  for (let index = 0; index < 8; index += 1) {
    const strain = Math.max(0, gap) * 0.12
    const length = Math.max(2, Math.round(own.expectedTurnLength * (0.8 + random() * 0.6)))
    const errorChance = Math.min(0.9, own.expectedErrorsPer100 / 100 * length * (1 + Math.max(0, gap) * 0.5) * (gap < 0 ? 0.5 : 1))
    const signal = turn({
      length,
      meaningErrors: random() < errorChance ? 1 : 0,
      lookups: random() < 0.05 + strain ? 1 : 0,
      translated: random() < strain * 0.6,
      nonTarget: random() < Math.max(0, gap - 2) * 0.08,
    })
    if (signal.translated) state = lowerConversation(state)
    state = tuneConversation(state, signal, 'en', signal.translated)
    signals.push(signal)
  }
  void expected
  return judgeConversation(conversationStats(signals, 'en', state.offset), baseStep, 'en').verdict
}

function simulateLearner(trueStep: number, startStep: number, conversations: number, random: () => number, withExpression: boolean) {
  let profile = { score: scoreOfStep(startStep), step: startStep, workingStep: startStep, locked: false }
  const assessments: AssessedConversation[] = []
  let difficultyChangedAt: string | null = null
  let estimateChangedAt: string | null = null
  const path: number[] = []
  let reversals = 0
  let lastDirection = 0
  for (let index = 0; index < conversations; index += 1) {
    const at = new Date(Date.UTC(2026, 0, 1 + index)).toISOString()
    const verdict = simulateConversation(trueStep, profile.workingStep, random)
    assessments.unshift({
      conversationId: `c${index}`, baseStep: profile.workingStep, estimateStep: profile.step, verdict,
      expressionStep: withExpression ? trueStep + (random() - 0.5) : null, assessedAt: at,
    })
    // Changes are stamped just after the conversation they rest on, as the store does.
    const changedAt = new Date(Date.UTC(2026, 0, 1 + index, 0, 0, 1)).toISOString()
    for (const change of decideAdjustment({ profile, assessments, difficultyChangedAt, estimateChangedAt })) {
      if (change.kind === 'estimate') {
        profile = { ...profile, step: change.toStep, score: scoreOfStep(change.toStep) }
        estimateChangedAt = changedAt
      } else {
        const direction = Math.sign(change.toStep - change.fromStep)
        if (lastDirection && direction !== lastDirection) reversals += 1
        lastDirection = direction
        profile = { ...profile, workingStep: change.toStep }
        difficultyChangedAt = changedAt
      }
    }
    path.push(profile.workingStep)
  }
  return { profile, path, reversals }
}

test('simulated learners: twenty conversations move the difficulty towards the real level without swinging', () => {
  const random = seeded(7)
  for (const withExpression of [true, false]) {
    for (const [trueStep, startStep] of [[10, 7], [7, 10], [4, 7], [13, 10], [7, 7], [1, 4], [16, 13]]) {
      let closer = 0
      let reversals = 0
      let overshoot = 0
      const runs = 30
      for (let run = 0; run < runs; run += 1) {
        const result = simulateLearner(trueStep, startStep, 20, random, withExpression)
        const before = Math.abs(startStep - trueStep)
        const after = Math.abs(result.profile.workingStep - trueStep)
        if (after < before || (before === 0 && after <= 1)) closer += 1
        reversals += result.reversals
        // Never more than a step past the real level in the direction of travel, and never ahead of the estimate by more than one.
        if (result.path.some((step) => (startStep <= trueStep ? step > trueStep + 2 : step < trueStep - 2))) overshoot += 1
        assert.ok(result.profile.workingStep <= result.profile.step + 1, 'difficulty at most one step above the estimate')
        assert.ok(result.profile.step - result.profile.workingStep <= 1, 'estimate follows the difficulty down')
      }
      const label = `true ${trueStep}, start ${startStep}, expression ${withExpression}`
      assert.ok(closer / runs >= 0.8, `${label}: closer in ${closer}/${runs}`)
      assert.ok(reversals / runs <= 1.5, `${label}: reversals per learner ${(reversals / runs).toFixed(2)}`)
      assert.ok(overshoot / runs <= 0.2, `${label}: overshoot in ${overshoot}/${runs}`)
    }
  }
})

test('simulated learners: a level that is already right stays put', () => {
  const random = seeded(99)
  let moved = 0
  const runs = 40
  for (let run = 0; run < runs; run += 1) {
    const result = simulateLearner(7, 7, 20, random, true)
    if (Math.abs(result.profile.workingStep - 7) > 1) moved += 1
  }
  assert.ok(moved / runs <= 0.15, `drifted more than a step in ${moved}/${runs}`)
})
