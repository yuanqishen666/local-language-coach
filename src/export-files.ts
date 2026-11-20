/**
 * Files the learner takes away: the wordbook as a text file Anki imports, and a conversation as
 * Markdown. Both are written in the browser from what the page already holds, so headings and
 * labels are in the interface language in use.
 */

export interface ExportWord {
  term: string
  meaning: string
  language: string
  source_sentence?: string | null
  details?: {
    pronunciation?: string
    partOfSpeech?: string
    senses?: Array<{ example?: string; translation?: string }>
  } | null
}

function oneLine(value: unknown) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim()
}

function html(value: unknown) {
  return oneLine(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
}

function tag(value: string) {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/gu, '')
}

/**
 * The wordbook as Anki's text import reads it: a few header lines, then one note per line with
 * the word on the front and its meaning, an example and where it was met on the back.
 * Fields are HTML, so a line break inside one is a <br> and the file has one line per note.
 */
export function ankiText(words: ExportWord[], deck: string) {
  const lines = [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic',
    `#deck:${oneLine(deck).replace(/["\t]/gu, ' ')}`,
    '#tags column:3',
  ]
  for (const word of words) {
    const term = html(word.term)
    const meaning = html(word.meaning)
    if (!term || !meaning) continue
    const pronunciation = html(word.details?.pronunciation)
    const front = pronunciation ? `${term}<br><small>${pronunciation}</small>` : term
    const sense = word.details?.senses?.find((item) => oneLine(item.example))
    const example = html(sense?.example) || html(word.source_sentence)
    const translation = sense && html(sense.example) ? html(sense.translation) : ''
    const back = [
      [html(word.details?.partOfSpeech), meaning].filter(Boolean).join(' · '),
      example,
      translation,
    ].filter(Boolean).join('<br>')
    lines.push([front, back, ['yujian', tag(word.language)].filter(Boolean).join(' ')].join('\t'))
  }
  return `${lines.join('\n')}\n`
}

export interface ExportMessage {
  role: 'user' | 'assistant'
  content: string
  status?: string
  meta?: {
    corrections?: Array<{ original: string; improved: string; explanation?: string }>
    reconstruction?: { original?: string; improved: string; explanation?: string } | null
  } | null
}

export interface ExportConversation {
  title: string
  createdAt: string
  setup?: { partnerName?: string; partnerRole?: string; setting?: string } | null
  messages: ExportMessage[]
}

export interface MarkdownLabels {
  /** What the learner's own lines are headed with. */
  you: string
  /** What the partner's lines are headed with when the partner has no name. */
  partner: string
  /** The line under the title: the day and the language, already written out. */
  subtitle: string
}

/** Characters that would start Markdown formatting inside a line of talk. */
function plain(value: string) {
  return oneLine(value).replace(/([\\`*_~[\]<>|])/gu, '\\$1')
}

/**
 * A conversation as Markdown: each line under its speaker, and under the learner's lines the
 * corrections made to them, which the app keeps with the reply that followed.
 */
export function conversationMarkdown(conversation: ExportConversation, labels: MarkdownLabels) {
  const partner = oneLine(conversation.setup?.partnerName) || oneLine(conversation.setup?.partnerRole) || labels.partner
  const scene = [conversation.setup?.partnerRole, conversation.setup?.setting].map(oneLine).filter(Boolean).join(' · ')
  const out = [`# ${plain(conversation.title)}`, '', plain(labels.subtitle)]
  if (scene) out.push('', plain(scene))
  const messages = conversation.messages.filter((message) => message.status !== 'failed' && message.status !== 'pending' && oneLine(message.content))
  messages.forEach((message, index) => {
    out.push('', `**${plain(message.role === 'user' ? labels.you : partner)}**: ${plain(message.content)}`)
    if (message.role !== 'user') return
    const reply = messages[index + 1]
    const meta = reply?.role === 'assistant' ? reply.meta : null
    const notes: string[] = []
    if (meta?.reconstruction?.improved) notes.push(`> → **${plain(meta.reconstruction.improved)}**${meta.reconstruction.explanation ? ` — ${plain(meta.reconstruction.explanation)}` : ''}`)
    for (const correction of meta?.corrections || []) {
      if (!correction.original || !correction.improved) continue
      notes.push(`> ~~${plain(correction.original)}~~ → **${plain(correction.improved)}**${correction.explanation ? ` — ${plain(correction.explanation)}` : ''}`)
    }
    if (notes.length) out.push('', notes.join('\n>\n'))
  })
  return `${out.join('\n')}\n`
}

/** A name safe to save a file under on any system. */
export function fileName(base: string, extension: string) {
  const name = oneLine(base).replace(/[\\/:*?"<>|\u0000-\u001f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 60)
  return `${name || 'yujian'}.${extension}`
}

export function downloadText(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
