import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesExpectedConversationLanguage, matchesExpectedLanguage } from './language.js'

const samples = {
  'zh-CN': '这个词表示两个人之间简短而友好的交谈。',
  'en-US': 'This word means a brief and friendly conversation between two people.',
  'es-419': 'Esta palabra significa una conversación breve y amistosa entre dos personas.',
  'fr-FR': 'Ce mot désigne une conversation brève et amicale entre deux personnes.',
  'ja-JP': 'この言葉は、二人の間の短く親しみやすい会話を表します。',
  'de-DE': 'Dieses Wort bezeichnet ein kurzes und freundliches Gespräch zwischen zwei Personen.',
  'ko-KR': '이 단어는 두 사람 사이의 짧고 친근한 대화를 뜻합니다.',
  'it-IT': 'Questa parola indica una conversazione breve e amichevole tra due persone.',
  'pt-BR': 'Esta palavra significa uma conversa breve e amigável entre duas pessoas.',
  'hi-IN': 'इस शब्द का अर्थ दो लोगों के बीच छोटी और मैत्रीपूर्ण बातचीत है।',
} as const

test('accepts natural output in every supported interface language', () => {
  for (const [locale, sample] of Object.entries(samples)) {
    assert.equal(matchesExpectedLanguage(sample, locale), true, locale)
  }
})

test('rejects every natural sample for each of the other nine interface languages', () => {
  for (const [sourceLocale, sample] of Object.entries(samples)) {
    for (const destinationLocale of Object.keys(samples)) {
      if (destinationLocale === sourceLocale) continue
      assert.equal(matchesExpectedLanguage(sample, destinationLocale), false, `${sourceLocale} -> ${destinationLocale}`)
    }
  }
})

test('rejects cross-script output even when it is short', () => {
  assert.equal(matchesExpectedLanguage('中文解释', 'es-419'), false)
  assert.equal(matchesExpectedLanguage('뜻을 설명합니다', 'fr-FR'), false)
  assert.equal(matchesExpectedLanguage('यह अर्थ है', 'en-US'), false)
})

test('rejects a foreign-language sentence hidden inside otherwise valid output', () => {
  assert.equal(matchesExpectedLanguage(`${samples['es-419']} 中文解释不能混进来。`, 'es-419'), false)
  assert.equal(matchesExpectedLanguage(`${samples['es-419']} This explanation must not appear here.`, 'es-419'), false)
  assert.equal(matchesExpectedLanguage(`${samples['zh-CN']} This explanation must not appear here.`, 'zh-CN'), false)
  assert.equal(matchesExpectedLanguage(`${samples['ja-JP']} This explanation must not appear here.`, 'ja-JP'), false)
})

test('distinguishes long Latin-script explanations', () => {
  assert.equal(matchesExpectedLanguage(samples['es-419'], 'en-US'), false)
  assert.equal(matchesExpectedLanguage(samples['fr-FR'], 'de-DE'), false)
  assert.equal(matchesExpectedLanguage(samples['it-IT'], 'pt-BR'), false)
})

test('keeps a natural English recommendation despite borrowed place and food terms', () => {
  const recommendation = "On the meal side, since you're allergic to shellfish, I'd steer you toward grilled fish, chicken, or veggie dishes at places that keep seafood prep separate, and I'd mention the allergy clearly to the kitchen, since cross-contact is the real risk."
  assert.equal(matchesExpectedConversationLanguage(recommendation, 'en-US'), true)
})

test('rejects short explanations written in another Latin language', () => {
  assert.equal(matchesExpectedLanguage('friendly chat', 'es-419'), false)
  assert.equal(matchesExpectedLanguage('house', 'es-419'), false)
  assert.equal(matchesExpectedLanguage('charla informal', 'es-419'), true)
  assert.equal(matchesExpectedLanguage('forme familière', 'fr-FR'), true)
  assert.equal(matchesExpectedLanguage('conversa informal', 'pt-BR'), true)
})

test('allows natural one-word dialogue without weakening explanation checks', () => {
  assert.equal(matchesExpectedConversationLanguage('好', 'zh'), true)
  assert.equal(matchesExpectedConversationLanguage('Gerne', 'de'), true)
  assert.equal(matchesExpectedConversationLanguage('Gracias', 'es'), true)
  assert.equal(matchesExpectedConversationLanguage('Thanks', 'es'), false)
  assert.equal(matchesExpectedLanguage('Gerne', 'de-DE'), false)
})

test('accepts localized short memory phrases and rejects leaked English labels', () => {
  assert.equal(matchesExpectedConversationLanguage('Softwareingenieur', 'de-DE'), true)
  assert.equal(matchesExpectedConversationLanguage('Softwareentwickler', 'de-DE'), true)
  assert.equal(matchesExpectedConversationLanguage('preferisce spiagge tranquille', 'it-IT'), true)
  assert.equal(matchesExpectedConversationLanguage('prefere praias tranquilas', 'pt-BR'), true)
  assert.equal(matchesExpectedConversationLanguage('software engineer', 'it-IT'), false)
  assert.equal(matchesExpectedConversationLanguage('profession', 'hi-IN'), false)
  assert.equal(matchesExpectedConversationLanguage('पेशा', 'hi-IN'), true)
})
