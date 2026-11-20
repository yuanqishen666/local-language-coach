import type { Directive } from 'vue'

/**
 * v-tip="text" names a control on hover and on keyboard focus, without the one-second wait of a
 * native title. One floating element serves the whole page; themes style `.lab-tip`.
 * v-tip:bottom / :left / :right pick a side; the default is above.
 */
let tip: HTMLDivElement | null = null
let owner: HTMLElement | null = null
let timer = 0

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function node() {
  if (!tip) {
    tip = document.createElement('div')
    tip.className = 'lab-tip'
    tip.setAttribute('role', 'tooltip')
    document.body.append(tip)
  }
  return tip
}

function place(el: HTMLElement) {
  const box = node()
  const rect = el.getBoundingClientRect()
  const gap = 8
  const width = box.offsetWidth
  const height = box.offsetHeight
  let side = el.dataset.tipSide || 'top'
  let x = rect.left + rect.width / 2 - width / 2
  let y = rect.top - height - gap
  if (side === 'right') { x = rect.right + gap; y = rect.top + rect.height / 2 - height / 2 }
  else if (side === 'left') { x = rect.left - width - gap; y = rect.top + rect.height / 2 - height / 2 }
  else if (side === 'bottom' || y < 6) { y = rect.bottom + gap; side = 'bottom' }
  box.style.transform = `translate(${Math.round(clamp(x, 6, window.innerWidth - width - 6))}px,${Math.round(clamp(y, 6, window.innerHeight - height - 6))}px)`
  box.dataset.side = side
}

function show(el: HTMLElement, delay: number) {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    const text = el.dataset.tip
    if (!text || !el.isConnected) return
    const box = node()
    owner = el
    box.textContent = text
    box.classList.remove('on')
    place(el)
    requestAnimationFrame(() => box.classList.add('on'))
  }, delay)
}

function hide(el?: HTMLElement) {
  window.clearTimeout(timer)
  if (el && owner && owner !== el) return
  owner = null
  tip?.classList.remove('on')
}

type Handlers = { enter(event: PointerEvent): void; leave(): void; focus(): void; blur(): void; down(): void }
const bound = new WeakMap<HTMLElement, Handlers>()

function write(el: HTMLElement, text: unknown, side?: string) {
  const value = typeof text === 'string' ? text : ''
  if (value) el.dataset.tip = value
  else delete el.dataset.tip
  if (side) el.dataset.tipSide = side
  if (owner === el) {
    if (value) { node().textContent = value; place(el) }
    else hide(el)
  }
}

export const vTip: Directive<HTMLElement, string | undefined | null> = {
  mounted(el, binding) {
    write(el, binding.value, binding.arg)
    const handlers: Handlers = {
      enter: (event) => { if (event.pointerType !== 'touch') show(el, 260) },
      leave: () => hide(el),
      focus: () => { if (el.matches(':focus-visible')) show(el, 0) },
      blur: () => hide(el),
      down: () => hide(el),
    }
    el.addEventListener('pointerenter', handlers.enter)
    el.addEventListener('pointerleave', handlers.leave)
    el.addEventListener('focus', handlers.focus)
    el.addEventListener('blur', handlers.blur)
    el.addEventListener('pointerdown', handlers.down)
    bound.set(el, handlers)
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) write(el, binding.value, binding.arg)
  },
  beforeUnmount(el) {
    const handlers = bound.get(el)
    if (handlers) {
      el.removeEventListener('pointerenter', handlers.enter)
      el.removeEventListener('pointerleave', handlers.leave)
      el.removeEventListener('focus', handlers.focus)
      el.removeEventListener('blur', handlers.blur)
      el.removeEventListener('pointerdown', handlers.down)
      bound.delete(el)
    }
    hide(el)
  },
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => hide(), { passive: true, capture: true })
}
