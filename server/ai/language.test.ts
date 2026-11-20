import assert from 'node:assert/strict'
import test from 'node:test'
import { joinedLanguageMatches, matchesExpectedConversationLanguage, matchesExpectedLanguage, mixesAnotherScript } from './language.js'

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

const targetSamples = {
  zh: samples['zh-CN'],
  en: samples['en-US'],
  es: samples['es-419'],
  fr: samples['fr-FR'],
  ja: samples['ja-JP'],
  de: samples['de-DE'],
  ko: samples['ko-KR'],
  it: samples['it-IT'],
  pt: samples['pt-BR'],
  hi: samples['hi-IN'],
} as const

test('accepts natural output in every supported interface language', () => {
  for (const [locale, sample] of Object.entries(samples)) {
    assert.equal(matchesExpectedLanguage(sample, locale), true, locale)
  }
})

test('the conversation guard accepts every supported target-language code', () => {
  for (const [code, sample] of Object.entries(targetSamples)) {
    assert.equal(matchesExpectedConversationLanguage(sample, code), true, code)
  }
})

test('the conversation guard rejects clear non-target input across all ten target languages', () => {
  for (const code of Object.keys(targetSamples)) {
    const foreign = code === 'en' ? samples['zh-CN'] : samples['en-US']
    assert.equal(matchesExpectedConversationLanguage(foreign, code), false, code)
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

test('allows natural one-word dialogue and one-word explanations, and still rejects a one-word leak', () => {
  assert.equal(matchesExpectedConversationLanguage('好', 'zh'), true)
  assert.equal(matchesExpectedConversationLanguage('Gerne', 'de'), true)
  assert.equal(matchesExpectedConversationLanguage('Gracias', 'es'), true)
  assert.equal(matchesExpectedConversationLanguage('Thanks', 'es'), false)
  // A single word proves nothing by itself: "Präposition", "neutral" and "好" are complete answers.
  assert.equal(matchesExpectedLanguage('Gerne', 'de-DE'), true)
  assert.equal(matchesExpectedLanguage('Präposition', 'de-DE'), true)
  assert.equal(matchesExpectedLanguage('好', 'zh-CN'), true)
  assert.equal(matchesExpectedLanguage('Thanks', 'de-DE'), false)
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

test('accepts ordinary opening lines, including ones that start with a one-word sentence', () => {
  const openings: Record<string, string[]> = {
    en: [
      "Welcome! Have a seat. I looked over your resume this morning, so why don't we start with your most recent project?",
      'Morning! Ready for a quick mock interview before the real one on Friday?',
      'Perfect. So, tell me a bit about what you have been building lately.',
      'Hey! I heard you have a big interview coming up. Nervous?',
      'Right. Interview prep night, then. Coffee first?',
      'Good afternoon. Please, take a seat.',
      'Honestly, system design questions still make my palms sweat.',
      'Hi Li Wei (李伟), nice to meet you. Shall we start?',
      'Welcome!',
    ],
    es: ['¡Bienvenido! Siéntate. Vi tu currículum esta mañana, así que empecemos por tu último proyecto.', 'Perfecto.'],
    fr: ['Bienvenue ! Installez-vous. On commence par votre dernier projet ?', 'Salut ! Prêt pour un petit entraînement avant vendredi ?'],
    de: ['Willkommen! Nehmen Sie Platz. Fangen wir mit Ihrem letzten Projekt an?', 'Morgen! Bereit für ein kurzes Übungsgespräch?', 'Na klar!'],
    it: ['Benvenuto! Accomodati pure. Partiamo dal tuo ultimo progetto?', 'Buongiorno! Pronto per una simulazione veloce?'],
    pt: ['Bem-vindo! Pode sentar. Vamos começar pelo seu último projeto?', 'Oi! Pronto para treinar um pouco antes da entrevista?'],
    zh: ['你好！最近工作忙吗？', '我最近在学 TypeScript 和 React Native。'],
    ja: ['こんにちは！最近、仕事は忙しいですか？'],
    ko: ['안녕하세요! 요즘 일은 바쁘세요?'],
    hi: ['नमस्ते! आजकल काम कैसा चल रहा है?'],
  }
  for (const [code, lines] of Object.entries(openings)) {
    for (const line of lines) assert.equal(matchesExpectedConversationLanguage(line, code), true, `${code}: ${line}`)
  }
})

test('rejects an opening line written in the interface language instead of the target language', () => {
  assert.equal(matchesExpectedConversationLanguage('欢迎！请坐。我们从你最近的项目开始吧。', 'en'), false)
  assert.equal(matchesExpectedConversationLanguage('我觉得 React 很好用。', 'en'), false)
  assert.equal(matchesExpectedConversationLanguage('Welcome! Have a seat.', 'es'), false)
  assert.equal(matchesExpectedConversationLanguage('Welcome! Have a seat.', 'zh'), false)
  assert.equal(matchesExpectedConversationLanguage('你好！最近工作忙吗？我们从项目开始吧。', 'ja'), false)
  assert.equal(matchesExpectedConversationLanguage('こんにちは！最近、仕事は忙しいですか？', 'zh'), false)
  assert.equal(matchesExpectedConversationLanguage('Oi! Pronto para treinar um pouco antes da entrevista?', 'es'), false)
})

test('accepts explanations that quote or embed words of the language being learned', () => {
  const explanations: Array<[string, string]> = [
    ['zh-CN', '“normaly” 拼写错误，应为 “normally”。'],
    ['zh-CN', '“on the market” 是固定搭配，表示“在市场上”。'],
    ['zh-CN', '这里应该用 “Compared with the products you normally see on the market”，语序更自然。'],
    ['zh-CN', 'normally 的拼写少了一个 l。'],
    ['zh-CN', '动词应使用过去式 went，而不是 go。'],
    ['zh-CN', '这里应该用 は 而不是 が。'],
    ['ja-JP', '「normaly」はスペルミスです。正しくは「normally」です。'],
    ['ja-JP', '名詞'],
    ['ko-KR', '여기서는 on the market을 씁니다.'],
    ['hi-IN', 'यहाँ on the market का प्रयोग होता है।'],
    ['en-US', 'Use 了 after the verb to show the action is complete.'],
    ['en-US', '“市场上” is more natural than “在市场” here.'],
    ['en-US', 'The measure word for books is 本, not 个.'],
    ['en-US', "Use 'estoy' instead of 'soy' for temporary states."],
    ['en-US', 'Spelling.'],
    ['es-419', 'Aquí se dice “on the market”, no “in the market”.'],
    ['es-419', 'preposición'],
    ['fr-FR', 'Ici, on dit « on the market » et non « in the market ».'],
    ['de-DE', 'Hier sagt man „on the market“, nicht „in the market“.'],
    ['it-IT', 'Qui si dice “on the market”, non “in the market”.'],
    ['pt-BR', 'Aqui se diz “on the market”, não “in the market”.'],
  ]
  for (const [locale, explanation] of explanations) {
    assert.equal(matchesExpectedLanguage(explanation, locale), true, `${locale}: ${explanation}`)
  }
})

test('rejects an explanation written in another language even when it mentions a few target words', () => {
  assert.equal(matchesExpectedLanguage('This is a spelling mistake.', 'zh-CN'), false)
  assert.equal(matchesExpectedLanguage('The word 市场 should be followed by 上.', 'zh-CN'), false)
  assert.equal(matchesExpectedLanguage('拼写错误。 This word is spelled incorrectly here.', 'zh-CN'), false)
  assert.equal(matchesExpectedLanguage('This is a spelling mistake.', 'es-419'), false)
  assert.equal(matchesExpectedLanguage('This is a spelling mistake.', 'ja-JP'), false)
  assert.equal(matchesExpectedLanguage('拼写错误，应为 normally。', 'en-US'), false)
})

test('does not count ordinary English words that look like words of other languages', () => {
  for (const phrase of ['Come in!', 'Old man', 'Due date', 'Per person', 'Solo trip', 'Pure luck', 'Red hat', 'War movie', 'Non-native speaker']) {
    assert.equal(matchesExpectedConversationLanguage(phrase, 'en'), true, phrase)
  }
})

test('judges interface descriptions as a whole and lets names and technical terms through', () => {
  assert.equal(joinedLanguageMatches('zh-CN', ['Java 后端面试', '工作', '一家 SaaS 创业公司的会议室', '技术主管', 'React 和 TypeScript', 'TypeScript']), true)
  assert.equal(joinedLanguageMatches('zh-CN', ['Mock interview', 'A meeting room at a tech company', 'Senior Backend Engineer at a startup']), false)
  assert.equal(joinedLanguageMatches('zh-CN', ['程序员面试模拟', 'A meeting room at a tech company', '技术面试官']), false)
  assert.equal(joinedLanguageMatches('en-US', ['Mock interview', 'A meeting room at a tech company', 'Kubernetes, Docker, PostgreSQL']), true)
  assert.equal(joinedLanguageMatches('es-419', ['Mock interview', 'A meeting room at a tech company', 'Technical interviewer']), false)
})

test('spots learner input that mixes another script into a Latin-script target language', () => {
  assert.equal(mixesAnotherScript('what do you think 这个产品的优缺点', 'en'), true)
  assert.equal(mixesAnotherScript('I want to 提升 my English', 'en'), true)
  assert.equal(mixesAnotherScript('Honestly, system design questions still make my palms sweat.', 'en'), false)
  assert.equal(mixesAnotherScript('我想要一个 sandwich', 'zh'), false)
})

test('an explanation may quote more of the language being learned than it says in its own words', () => {
  assert.equal(matchesExpectedLanguage('bread 不可数，要说 two loaves of bread 或 some bread。', 'zh-CN'), true)
  assert.equal(matchesExpectedLanguage('应该说 I have been living here for three years，不是 I live here since three years。', 'zh-CN'), true)
  assert.equal(matchesExpectedLanguage('正确的说法是：\nI have lived here for three years.', 'zh-CN'), true)
  assert.equal(matchesExpectedLanguage('breadは不可算名詞なので、two loaves of bread か some bread と言います。', 'ja-JP'), true)
  assert.equal(matchesExpectedLanguage('I have been living here for three years が自然です', 'ja-JP'), true)
  assert.equal(matchesExpectedLanguage('bread는 셀 수 없는 명사라서 two loaves of bread 또는 some bread라고 해야 합니다.', 'ko-KR'), true)
  assert.equal(matchesExpectedLanguage('bread अगणनीय संज्ञा है, इसलिए two loaves of bread या some bread कहें।', 'hi-IN'), true)
  assert.equal(matchesExpectedLanguage('The correct form is:\n我昨天去了市场。', 'en-US'), true)

  // The frame decides, not the amount: these are English sentences that happen to carry learner words.
  assert.equal(matchesExpectedLanguage('You wrote 我昨天去了市场 in Chinese; in English you would say I went to the market yesterday.', 'zh-CN'), false)
  assert.equal(matchesExpectedLanguage('You wrote 我昨天去了市场，买了面包 in Chinese; in English you would say I went to the market and bought bread.', 'zh-CN'), false)
  assert.equal(matchesExpectedLanguage('The word 시장 should be followed by 에.', 'ko-KR'), false)
  assert.equal(matchesExpectedLanguage('好。The past tense of go is went, so you should say I went to the market yesterday instead.', 'zh-CN'), false)
  assert.equal(matchesExpectedLanguage('这是语法错误，这里要用过去式来表达。', 'ja-JP'), false)
})

test('accepts openings made of short sentences, the way people start an interview or a chat', () => {
  for (const opening of [
    'Welcome! Please take a seat and tell me a little about yourself.',
    "Hi, thanks for coming in. I'm Sarah, the engineering manager. Shall we start with a quick intro?",
    'Morning! Coffee first, or shall we dive straight into the system design question?',
    "Okay. Imagine I'm the interviewer. Tell me about a bug you fixed recently.",
    'Great, you made it! Grab a chair. Have you done a technical interview before?',
  ]) assert.equal(matchesExpectedConversationLanguage(opening, 'en'), true, opening)
})
