import type { ObjectDirective } from 'vue'

export const LOOKUP_TERM_LIMIT = 80

export interface TextLookupBinding {
  context: string
  onLookup: (term: string, context: string) => void
  enabled?: boolean
}

interface LookupDirectiveState {
  binding: TextLookupBinding
  pressTimer?: ReturnType<typeof setTimeout>
  pointerStart?: { x: number; y: number }
  lastLookup?: { term: string; context: string; at: number }
  listeners: {
    mouseup: (event: MouseEvent) => void
    dblclick: (event: MouseEvent) => void
    pointerdown: (event: PointerEvent) => void
    pointermove: (event: PointerEvent) => void
    pointerend: () => void
  }
}

const directiveStates = new WeakMap<HTMLElement, LookupDirectiveState>()

export function normalizeLookupTerm(value: string) {
  const term = value.normalize('NFC').trim()
  return term && term.length < LOOKUP_TERM_LIMIT ? term : ''
}

export function wordAtTextOffset(value: string, offset: number) {
  if (!value || offset < 0 || offset > value.length) return ''
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
  const segments = [...segmenter.segment(value)]
  const segment = segments.find((item) => {
    const end = item.index + item.segment.length
    return item.isWordLike && offset >= item.index && (offset < end || (offset === value.length && end === value.length))
  })
  return normalizeLookupTerm(segment?.segment || '')
}

function containsNode(element: HTMLElement, node: Node | null) {
  return Boolean(node && (node === element || element.contains(node)))
}

function selectedText(element: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !containsNode(element, selection.anchorNode) || !containsNode(element, selection.focusNode)) return ''
  return normalizeLookupTerm(selection.toString())
}

function caretPointAt(documentValue: Document, x: number, y: number) {
  const range = documentValue.caretRangeFromPoint?.(x, y)
  if (range) return { node: range.startContainer, offset: range.startOffset }

  const documentWithCaretPosition = documentValue as Document & {
    caretPositionFromPoint?: (clientX: number, clientY: number) => { offsetNode: Node; offset: number } | null
  }
  const position = documentWithCaretPosition.caretPositionFromPoint?.(x, y)
  return position ? { node: position.offsetNode, offset: position.offset } : null
}

function textPoint(node: Node, offset: number): { text: string; offset: number } | null {
  if (node.nodeType === Node.TEXT_NODE) return { text: node.textContent || '', offset }
  const children = [...node.childNodes]
  const candidate = children[Math.min(offset, children.length - 1)] || children.at(-1)
  if (!candidate) return null
  const walker = candidate.ownerDocument?.createTreeWalker(candidate, NodeFilter.SHOW_TEXT)
  if (!walker) return null
  const textNode = walker.nextNode()
  return textNode ? { text: textNode.textContent || '', offset: 0 } : null
}

function wordAtPoint(element: HTMLElement, x: number, y: number) {
  const point = caretPointAt(element.ownerDocument, x, y)
  if (!point || !containsNode(element, point.node)) return ''
  const text = textPoint(point.node, point.offset)
  return text ? wordAtTextOffset(text.text, text.offset) : ''
}

function clearPress(state: LookupDirectiveState) {
  if (state.pressTimer !== undefined) clearTimeout(state.pressTimer)
  state.pressTimer = undefined
  state.pointerStart = undefined
}

function performLookup(state: LookupDirectiveState, term: string) {
  const context = state.binding.context.trim()
  if (!term || !context || state.binding.enabled === false) return
  const now = Date.now()
  if (state.lastLookup && state.lastLookup.term === term && state.lastLookup.context === context && now - state.lastLookup.at < 300) return
  state.lastLookup = { term, context, at: now }
  state.binding.onLookup(term, context)
}

export const textLookupDirective: ObjectDirective<HTMLElement, TextLookupBinding> = {
  mounted(element, directiveBinding) {
    const state = {
      binding: directiveBinding.value,
      listeners: {} as LookupDirectiveState['listeners'],
    } as LookupDirectiveState

    const select = () => performLookup(state, selectedText(element))
    state.listeners.mouseup = select
    state.listeners.dblclick = select
    state.listeners.pointerdown = (event) => {
      if (state.binding.enabled === false || event.pointerType === 'mouse' || !event.isPrimary) return
      clearPress(state)
      state.pointerStart = { x: event.clientX, y: event.clientY }
      state.pressTimer = setTimeout(() => {
        state.pressTimer = undefined
        performLookup(state, wordAtPoint(element, event.clientX, event.clientY))
      }, 520)
    }
    state.listeners.pointermove = (event) => {
      if (!state.pointerStart) return
      if (Math.hypot(event.clientX - state.pointerStart.x, event.clientY - state.pointerStart.y) > 10) clearPress(state)
    }
    state.listeners.pointerend = () => clearPress(state)

    element.addEventListener('mouseup', state.listeners.mouseup)
    element.addEventListener('dblclick', state.listeners.dblclick)
    element.addEventListener('pointerdown', state.listeners.pointerdown)
    element.addEventListener('pointermove', state.listeners.pointermove)
    element.addEventListener('pointerup', state.listeners.pointerend)
    element.addEventListener('pointercancel', state.listeners.pointerend)
    element.addEventListener('lostpointercapture', state.listeners.pointerend)
    directiveStates.set(element, state)
  },
  updated(element, directiveBinding) {
    const state = directiveStates.get(element)
    if (state) state.binding = directiveBinding.value
  },
  beforeUnmount(element) {
    const state = directiveStates.get(element)
    if (!state) return
    clearPress(state)
    element.removeEventListener('mouseup', state.listeners.mouseup)
    element.removeEventListener('dblclick', state.listeners.dblclick)
    element.removeEventListener('pointerdown', state.listeners.pointerdown)
    element.removeEventListener('pointermove', state.listeners.pointermove)
    element.removeEventListener('pointerup', state.listeners.pointerend)
    element.removeEventListener('pointercancel', state.listeners.pointerend)
    element.removeEventListener('lostpointercapture', state.listeners.pointerend)
    directiveStates.delete(element)
  },
}
