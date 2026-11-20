// Wraps the <script setup> block of each page and component into a composable, verbatim,
// so the /lab previews run the same logic as the real pages while only templates differ.
// Run after changing page logic:  node src/lab/logic/generate.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileScript, parse } from 'vue/compiler-sfc'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')

const sources = [
  { file: 'src/pages/HomePage.vue' },
  { file: 'src/pages/OnboardingPage.vue' },
  { file: 'src/pages/PlacementPage.vue' },
  { file: 'src/pages/SceneBuilderPage.vue' },
  { file: 'src/pages/ConversationPage.vue' },
  { file: 'src/pages/HistoryPage.vue' },
  { file: 'src/pages/WordbookPage.vue' },
  { file: 'src/pages/ReviewPage.vue' },
  { file: 'src/pages/MemoriesPage.vue' },
  { file: 'src/pages/SettingsPage.vue' },
  { file: 'src/pages/RecapPage.vue' },
  { file: 'src/pages/PracticePage.vue' },
  { file: 'src/pages/StoryPage.vue' },
  { file: 'src/pages/ImportPage.vue' },
  { file: 'src/pages/ProgressPage.vue' },
  { file: 'src/pages/LivePage.vue' },
  {
    file: 'src/components/MessageBubble.vue',
    params: "props: { message: Message; feedback?: MessageMeta; partnerInitial: string; targetLanguageCode: string }, emit: (event: any, ...args: any[]) => void",
  },
  {
    file: 'src/components/LookupDrawer.vue',
    params: 'props: { term: string; sentence: string; conversationId: string; open: boolean; setup?: unknown; targetLanguageCode?: string }',
  },
  { file: 'src/components/LevelCard.vue', params: 'props: { languageCode: string }' },
  {
    file: 'src/components/SpeakButton.vue',
    params: 'props: { text: string; languageCode: string; speechId: string; showLabel: boolean; compact: boolean }',
  },
]

const MACROS = new Set(['defineProps', 'defineEmits', 'withDefaults'])

function patternNames(node, names = []) {
  if (!node) return names
  if (node.type === 'Identifier') names.push(node.name)
  else if (node.type === 'ObjectPattern') node.properties.forEach((property) => patternNames(property.type === 'RestElement' ? property.argument : property.value, names))
  else if (node.type === 'ArrayPattern') node.elements.forEach((element) => patternNames(element, names))
  else if (node.type === 'AssignmentPattern') patternNames(node.left, names)
  else if (node.type === 'RestElement') patternNames(node.argument, names)
  return names
}

function isMacroDeclaration(statement) {
  if (statement.type !== 'VariableDeclaration') return false
  return statement.declarations.every((declaration) => declaration.init?.type === 'CallExpression' && MACROS.has(declaration.init.callee.name))
}

function rewriteSource(fromFile, source) {
  if (!source.startsWith('.')) return source
  const absolute = path.resolve(path.dirname(path.join(root, fromFile)), source)
  const relative = path.relative(here, absolute).split(path.sep).join('/')
  return relative.startsWith('.') ? relative : `./${relative}`
}

for (const { file, params = '' } of sources) {
  const text = readFileSync(path.join(root, file), 'utf8')
  const { descriptor } = parse(text, { filename: file })
  const code = descriptor.scriptSetup.content
  const statements = compileScript(descriptor, { id: file }).scriptSetupAst
  const name = path.basename(file, '.vue')

  const body = []
  const exposed = []
  for (const statement of statements) {
    if (statement.type === 'ImportDeclaration' || isMacroDeclaration(statement)) continue
    body.push(statement)
    if (statement.type === 'VariableDeclaration' && statement.kind === 'const') statement.declarations.forEach((declaration) => patternNames(declaration.id, exposed))
    else if (statement.type === 'FunctionDeclaration') exposed.push(statement.id.name)
  }
  const first = body[0].leadingComments?.[0]?.start ?? body[0].start
  const last = body.at(-1).end
  let bodyText = ''
  let cursor = first
  for (const statement of statements) {
    if (statement.start < first || statement.end > last || body.includes(statement)) continue
    bodyText += code.slice(cursor, statement.start)
    cursor = statement.end
  }
  bodyText = (bodyText + code.slice(cursor, last)).replace(/^\n+/u, '')
  const used = (local) => new RegExp(`(?<![\\w$.])${local.replace(/\$/g, '\\$')}(?![\\w$])`, 'u').test(bodyText) || params.includes(local)

  const imports = []
  for (const statement of statements) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value.endsWith('.vue')) continue
    const typeOnly = statement.importKind === 'type'
    const specifiers = statement.specifiers.filter((specifier) => used(specifier.local.name)).map((specifier) => {
      const imported = specifier.imported?.name ?? specifier.imported?.value
      const prefix = specifier.importKind === 'type' && !typeOnly ? 'type ' : ''
      return imported === specifier.local.name ? `${prefix}${imported}` : `${prefix}${imported} as ${specifier.local.name}`
    })
    if (specifiers.length) imports.push(`import ${typeOnly ? 'type ' : ''}{ ${specifiers.join(', ')} } from '${rewriteSource(file, statement.source.value)}'`)
  }

  const output = [
    `// Generated from ${file} by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.`,
    ...imports,
    '',
    `export function use${name}(${params}) {`,
    bodyText,
    '',
    `  return { ${exposed.join(', ')} }`,
    '}',
    '',
  ].join('\n')
  writeFileSync(path.join(here, `${name}.ts`), output)
  console.log(`${name}: ${exposed.length} bindings`)
}
