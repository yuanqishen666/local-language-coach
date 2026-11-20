import type { Directive } from 'vue'

export function hasFinePointer() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

type Cleanup = () => void
const cleanups = new WeakMap<HTMLElement, Cleanup>()

function bind(el: HTMLElement, cleanup: Cleanup) {
  cleanups.get(el)?.()
  cleanups.set(el, cleanup)
}

function release(el: HTMLElement) {
  cleanups.get(el)?.()
  cleanups.delete(el)
}

/**
 * Tilts an element toward the pointer. Exposes --rx / --ry (rotation) and
 * --gx / --gy (pointer position in %) so the stylesheet decides how to use them.
 */
export const vTilt: Directive<HTMLElement, number | undefined> = {
  mounted(el, binding) {
    const max = binding.value ?? 8
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || prefersReducedMotion()) return
      const rect = el.getBoundingClientRect()
      const px = clamp((event.clientX - rect.left) / rect.width, 0, 1)
      const py = clamp((event.clientY - rect.top) / rect.height, 0, 1)
      el.style.setProperty('--rx', `${((0.5 - py) * max).toFixed(2)}deg`)
      el.style.setProperty('--ry', `${((px - 0.5) * max).toFixed(2)}deg`)
      el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`)
      el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`)
    }
    const leave = () => {
      el.style.setProperty('--rx', '0deg')
      el.style.setProperty('--ry', '0deg')
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    bind(el, () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    })
  },
  unmounted: release,
}

/**
 * Lets an element be picked up and dropped; it springs back to where it lives.
 * Exposes --dx / --dy / --dr and toggles the `dragging` class. A drag never
 * turns into a click on whatever sits underneath.
 */
export const vDrag: Directive<HTMLElement> = {
  mounted(el) {
    let startX = 0
    let startY = 0
    let pointerId = -1
    let moved = false

    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return
      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY
      moved = false
      el.setPointerCapture(pointerId)
      el.classList.add('dragging')
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      // A release that happened outside the window never reaches us as pointerup.
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        drop()
        return
      }
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      if (Math.hypot(dx, dy) > 4) moved = true
      el.style.setProperty('--dx', `${dx}px`)
      el.style.setProperty('--dy', `${dy}px`)
      el.style.setProperty('--dr', `${clamp(dx * 0.08, -24, 24)}deg`)
    }
    const drop = () => {
      if (pointerId === -1) return
      const held = pointerId
      pointerId = -1
      if (el.hasPointerCapture(held)) el.releasePointerCapture(held)
      el.classList.remove('dragging')
      el.style.setProperty('--dx', '0px')
      el.style.setProperty('--dy', '0px')
      el.style.setProperty('--dr', '0deg')
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId === pointerId) drop()
    }
    const click = (event: MouseEvent) => {
      if (!moved) return
      event.preventDefault()
      event.stopImmediatePropagation()
      moved = false
    }
    const blockNativeDrag = (event: Event) => event.preventDefault()

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('lostpointercapture', up)
    el.addEventListener('click', click, true)
    el.addEventListener('dragstart', blockNativeDrag)
    bind(el, () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('lostpointercapture', up)
      el.removeEventListener('click', click, true)
      el.removeEventListener('dragstart', blockNativeDrag)
    })
  },
  unmounted: release,
}
