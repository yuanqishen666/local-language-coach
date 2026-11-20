/**
 * A few minutes of talk at the end of the day: a conversation that starts at once, stays on how
 * the day went, and winds down by itself. The first line is fixed, so starting costs no request.
 */

export const BEDTIME_CATEGORY = 'bedtime'

/** About how many messages the learner writes before the partner says good night. */
export const BEDTIME_TURNS = 5

/** [between friends, polite] */
const OPENINGS: Record<string, readonly [string, string]> = {
  en: ['How was your day?', 'How was your day?'],
  es: ['¿Qué tal tu día?', '¿Qué tal su día?'],
  fr: ['Alors, ta journée ?', 'Comment s’est passée votre journée ?'],
  ja: ['今日はどんな一日だった？', '今日はどんな一日でしたか。'],
  de: ['Wie war dein Tag?', 'Wie war Ihr Tag?'],
  ko: ['오늘 하루 어땠어?', '오늘 하루 어떠셨어요?'],
  it: ['Com’è andata la giornata?', 'Com’è andata la sua giornata?'],
  zh: ['今天过得怎么样？', '您今天过得怎么样？'],
  pt: ['Como foi o seu dia?', 'Como foi o seu dia?'],
  hi: ['आज का दिन कैसा रहा?', 'आज आपका दिन कैसा रहा?'],
}

/** Where the informal line differs by country. */
const REGIONAL: Record<string, string> = {
  'pt-PT': 'Como foi o teu dia?',
  'zh-TW': '今天過得怎麼樣？',
}

const REGIONAL_POLITE: Record<string, string> = {
  'zh-TW': '您今天過得怎麼樣？',
}

/** The partner's first line, or an empty string for a language without one, in which case the learner speaks first. */
export function bedtimeOpening(languageCode: string, variant = '', register = 'neutral') {
  const base = String(languageCode || '').toLowerCase().split(/[-_]/u)[0]
  const lines = OPENINGS[base]
  if (!lines) return ''
  if (register === 'formal') return REGIONAL_POLITE[variant] || lines[1]
  return REGIONAL[variant] || lines[0]
}

/** What the partner is told about this kind of conversation. */
export const BEDTIME_RULE = 'This is a few quiet minutes of talk at the end of the day, before sleep. Keep every reply to one or two short sentences and stay with how the day went and what tomorrow holds. Once the learner has written about ' + BEDTIME_TURNS + ' messages, wind down: answer what they said, wish them a good night, and ask nothing further.'
