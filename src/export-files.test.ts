import test from 'node:test'
import assert from 'node:assert/strict'
import { ankiText, conversationMarkdown, fileName } from './export-files'
import { activityGrid, levelCurve, monthStarts } from './progress-grid'
import { formatCost, mainlandChinaClock } from './usage'

test('the wordbook is written the way Anki imports text', () => {
  const text = ankiText([
    {
      term: 'take <off>',
      meaning: '起飞 & 脱下',
      language: 'en',
      source_sentence: 'The plane\ttook off\nlate.',
      details: { pronunciation: '/teɪk ɒf/', partOfSpeech: 'verb', senses: [{ example: 'Take off your coat.', translation: '把外套脱了。' }] },
    },
    { term: 'sobremesa', meaning: '饭后闲聊', language: 'es', source_sentence: 'La sobremesa duró horas.' },
    { term: 'no meaning yet', meaning: ' ', language: 'en' },
  ], '语见 · 英语')
  const lines = text.trimEnd().split('\n')
  assert.deepEqual(lines.slice(0, 5), ['#separator:tab', '#html:true', '#notetype:Basic', '#deck:语见 · 英语', '#tags column:3'])
  assert.equal(lines.length, 7)
  assert.equal(lines.slice(5).every((line) => line.split('\t').length === 3), true)
  assert.equal(lines[5], 'take &lt;off&gt;<br><small>/teɪk ɒf/</small>\tverb · 起飞 &amp; 脱下<br>Take off your coat.<br>把外套脱了。\tyujian en')
  assert.equal(lines[6], 'sobremesa\t饭后闲聊<br>La sobremesa duró horas.\tyujian es')
  assert.equal(text.endsWith('\n'), true)
})

test('a conversation is written as Markdown with corrections under the line they are about', () => {
  const text = conversationMarkdown({
    title: 'Café *chat*',
    createdAt: '2026-11-20T08:00:00.000Z',
    setup: { partnerName: 'María', partnerRole: 'Barista', setting: 'Café' },
    messages: [
      { role: 'assistant', content: 'Hola, ¿qué te pongo?' },
      { role: 'user', content: 'Yo quiero un café\ncon leche' },
      {
        role: 'assistant',
        content: '¡Claro!',
        meta: { corrections: [{ original: 'Yo quiero', improved: 'Quería', explanation: 'más cortés' }, { original: '', improved: 'x' }] },
      },
      { role: 'user', content: 'lost', status: 'failed' },
      { role: 'user', content: 'Gracias' },
    ],
  }, { you: 'Yo', partner: 'Partner', subtitle: '20 nov 2026 · español' })
  assert.equal(text, [
    '# Café \\*chat\\*',
    '',
    '20 nov 2026 · español',
    '',
    'Barista · Café',
    '',
    '**María**: Hola, ¿qué te pongo?',
    '',
    '**Yo**: Yo quiero un café con leche',
    '',
    '> ~~Yo quiero~~ → **Quería** — más cortés',
    '',
    '**María**: ¡Claro!',
    '',
    '**Yo**: Gracias',
    '',
  ].join('\n'))

  const unnamed = conversationMarkdown({ title: 'Open', createdAt: '', setup: null, messages: [{ role: 'assistant', content: 'Hi' }] }, { you: 'Me', partner: 'Partner', subtitle: 'today' })
  assert.equal(unnamed.includes('**Partner**: Hi'), true)
})

test('a file name holds nothing a file system refuses', () => {
  assert.equal(fileName('a/b:c*d?"e<f>g|h', 'md'), 'a b c d e f g h.md')
  assert.equal(fileName('   ', 'txt'), 'yujian.txt')
  assert.equal(fileName('x'.repeat(200), 'md').length, 63)
})

test('the activity grid is whole weeks from Monday, ending with the week of today', () => {
  // 2026-11-20 is a Friday.
  const grid = activityGrid([
    { date: '2026-11-16', messages: 2, amount: 10 },
    { date: '2026-11-20', messages: 8, amount: 40 },
    { date: '2026-11-08', messages: 1, amount: 1 },
    { date: '2025-01-01', messages: 9, amount: 9000 },
  ], '2026-11-20', 3)
  assert.equal(grid.length, 3)
  assert.equal(grid.every((week) => week.length === 7), true)
  assert.equal(grid[0][0].date, '2026-11-02')
  assert.equal(grid[2][0].date, '2026-11-16')
  assert.equal(grid[2][6].date, '2026-11-22')
  assert.deepEqual(grid[2].map((day) => day.future), [false, false, false, false, false, true, true])
  assert.equal(grid[2][4].level, 4)
  assert.equal(grid[2][0].level, 1)
  assert.equal(grid[0][6].level, 1)
  assert.equal(grid[1][2].level, 0)
  assert.equal(grid[2][4].messages, 8)
})

test('month names stand over the week a month starts in', () => {
  const grid = activityGrid([], '2026-11-20', 26)
  const starts = monthStarts(grid)
  assert.equal(starts.every((item) => grid[item.week][0].date === item.date), true)
  assert.deepEqual(starts.map((item) => item.date.slice(0, 7)), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
  // The grid opens on 25 May, a week before June: May's name would collide with June's and is left out.
  assert.equal(grid[0][0].date, '2026-05-25')
})

test('the level curve needs two readings and stays inside its box', () => {
  assert.equal(levelCurve([4]), '')
  const points = levelCurve([3, 4, 4, 6]).split(' ').map((point) => point.split(',').map(Number))
  assert.equal(points.length, 4)
  assert.equal(points[0][0], 0)
  assert.equal(points[3][0], 100)
  assert.equal(points.every(([, y]) => y >= 2 && y <= 26), true)
  assert.equal(points[3][1] < points[0][1], true)
})

test('costs keep four decimals under a dollar and two above', () => {
  assert.equal(formatCost(0.0153, 'en-US'), '$0.0153')
  assert.equal(formatCost(0.5, 'en-US'), '$0.50')
  assert.equal(formatCost(12.345, 'en-US'), '$12.35')
  assert.equal(formatCost(0, 'en-US'), '$0.00')
  assert.equal(formatCost(0.00002, 'en-US'), '< $0.0001')
  assert.equal(formatCost(Number.NaN, 'en-US'), '$0.00')
  assert.equal(formatCost(1.5, 'zh-CN').includes('1.50'), true)
})

test('only mainland China clocks get the note on reachable services', () => {
  assert.equal(mainlandChinaClock('Asia/Shanghai'), true)
  assert.equal(mainlandChinaClock('Asia/Urumqi'), true)
  assert.equal(mainlandChinaClock('Asia/Hong_Kong'), false)
  assert.equal(mainlandChinaClock('Asia/Taipei'), false)
  assert.equal(mainlandChinaClock('Europe/Berlin'), false)
})
