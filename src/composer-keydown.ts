export interface ComposerKeyEvent {
  key: string
  shiftKey?: boolean
  isComposing?: boolean
  keyCode?: number
}

/** Enter confirms an IME candidate while composition is active. It must only
 * submit after composition has finished and the user presses Enter again. */
export function shouldSubmitComposer(event: ComposerKeyEvent, compositionActive = false) {
  return event.key === 'Enter' &&
    !event.shiftKey &&
    !compositionActive &&
    !event.isComposing &&
    event.keyCode !== 229
}
