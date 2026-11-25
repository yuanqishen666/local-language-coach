import { shallowReactive, type Component } from 'vue'

/**
 * What whoever serves the app puts above the message box of a conversation, in every design. Each is
 * given the conversation as `conversation` and decides for itself whether it has anything to show.
 */
export const aboveComposer = shallowReactive<Component[]>([])

export function addAboveComposer(component: Component) {
  aboveComposer.push(component)
}
