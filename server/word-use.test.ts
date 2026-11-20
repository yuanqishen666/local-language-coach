import assert from 'node:assert/strict'
import test from 'node:test'
import { useResult, wordUse } from './word-use.js'

function surface(text: string, term: string, language: string, lemma?: string) {
  return wordUse(text, { term, lemma }, language)?.surface ?? null
}

test('an English word is found in its regular forms and not inside other words', () => {
  assert.equal(surface('The broth was really rich.', 'rich', 'en'), 'rich')
  assert.equal(surface('It tasted richer than last time.', 'rich', 'en'), 'richer')
  assert.equal(surface('We waited almost forty minutes.', 'wait', 'en'), 'waited')
  assert.equal(surface('I am making dinner.', 'make', 'en'), 'making')
  assert.equal(surface('She carried the bags.', 'carry', 'en'), 'carried')
  assert.equal(surface('He stopped at the corner.', 'stop', 'en'), 'stopped')
  assert.equal(surface('Rich people live there.', 'rich', 'en'), 'Rich')
  assert.equal(surface('I ate rice with Richard.', 'rich', 'en'), null)
  assert.equal(surface('My waist hurts.', 'wait', 'en'), null)
  assert.equal(surface('I made dinner.', 'make', 'en'), null)
})

test('a saved form is also found through its dictionary form', () => {
  assert.equal(surface('They commit to it every year.', 'committed', 'en', 'commit'), 'commit')
  assert.equal(surface('That takes real commitment.', 'commit', 'en'), null)
})

test('a phrase is found whole, or with a word or two in between', () => {
  assert.equal(surface('I will never give up.', 'give up', 'en'), 'give up')
  assert.equal(surface('She gave it up.', 'give up', 'en'), null)
  assert.equal(surface('Do not give it up now.', 'give up', 'en'), 'give')
  assert.equal(surface('Give me the cup.', 'give up', 'en'), null)
  assert.equal(surface('It was worth the wait.', 'worth the wait', 'en'), 'worth the wait')
})

test('Spanish, Portuguese, Italian and French verbs are found by their stem', () => {
  assert.equal(surface('Ayer hablamos de eso.', 'hablar', 'es'), 'hablamos')
  assert.equal(surface('Hablo español un poco.', 'hablar', 'es'), 'Hablo')
  assert.equal(surface('Como en casa.', 'comer', 'es'), null)
  assert.equal(surface('Comemos a las dos.', 'comer', 'es'), 'Comemos')
  assert.equal(surface('Tengo dos palabras nuevas.', 'palabra', 'es'), 'palabras')
  assert.equal(surface('Eu trabalhei muito ontem.', 'trabalhar', 'pt'), 'trabalhei')
  assert.equal(surface('Abbiamo parlato a lungo.', 'parlare', 'it'), 'parlato')
  assert.equal(surface('Nous mangeons ensemble.', 'manger', 'fr'), 'mangeons')
  assert.equal(surface('C’est la fin du film.', 'finir', 'fr'), null)
  assert.equal(surface('Je finis mon travail.', 'finir', 'fr'), 'finis')
})

test('German verbs are found conjugated and as participles', () => {
  assert.equal(surface('Er macht das jeden Tag.', 'machen', 'de'), 'macht')
  assert.equal(surface('Ich habe es gestern gemacht.', 'machen', 'de'), 'gemacht')
  assert.equal(surface('Die Gärten sind groß.', 'Garten', 'de'), null)
  assert.equal(surface('Im Garten ist es still.', 'Garten', 'de'), 'Garten')
})

test('Chinese and Japanese words are found without spaces', () => {
  assert.equal(surface('这家店的汤头很浓郁。', '浓郁', 'zh'), '浓郁')
  assert.equal(surface('我们等了很久。', '浓郁', 'zh'), null)
  assert.equal(surface('昨日ラーメンを食べました。', '食べる', 'ja'), '食べ')
  assert.equal(surface('来週京都に行きます。', '行く', 'ja'), '行き')
  assert.equal(surface('銀行にお金があります。', '行く', 'ja'), null)
  assert.equal(surface('旅行が好きです。', '行く', 'ja'), null)
  assert.equal(surface('この山は高かった。', '高い', 'ja'), '高か')
  assert.equal(surface('高校の友達に会った。', '高い', 'ja'), null)
  assert.equal(surface('食べ物がおいしい。', '食べる', 'ja'), null)
})

test('Korean words are found with particles and endings', () => {
  assert.equal(surface('어제 한국어를 공부했어요.', '공부하다', 'ko'), '공부했어요')
  assert.equal(surface('밥을 먹었어요.', '먹다', 'ko'), '먹었어요')
  assert.equal(surface('커피를 마셔요.', '마시다', 'ko'), '마셔요')
  assert.equal(surface('학교에 가요.', '가다', 'ko'), '가요')
  assert.equal(surface('가방을 샀어요.', '가다', 'ko'), null)
  assert.equal(surface('친구를 만났어요.', '친구', 'ko'), '친구를')
  assert.equal(surface('날씨가 좋아요.', '친구', 'ko'), null)
})

test('Hindi words are found in their common forms', () => {
  assert.equal(surface('मैं रोज़ काम करता हूँ।', 'करना', 'hi'), 'करता')
  assert.equal(surface('वह करीब दस बजे आया।', 'करना', 'hi'), null)
  assert.equal(surface('दो लड़के खेल रहे हैं।', 'लड़का', 'hi'), 'लड़के')
  assert.equal(surface('मेरे पास दो किताबें हैं।', 'किताब', 'hi'), 'किताबें')
})

test('a used word is a slip only when a correction took that form out', () => {
  assert.equal(useResult('go', [{ original: 'I finally go to', improved: 'I finally went to' }]), 'slip')
  assert.equal(useResult('market', [{ original: 'I go to the market', improved: 'I went to the market' }]), 'right')
  assert.equal(useResult('rich', []), 'right')
  assert.equal(useResult('richs', [{ original: 'very richs', improved: 'very rich' }]), 'slip')
})
