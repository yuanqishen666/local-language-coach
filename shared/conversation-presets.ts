import type { SceneSafetyClass } from './conversation-scenes.js'

export type ConversationPresetKind = 'instant' | 'anchor'

export interface ConversationPresetDefinition {
  id: string
  kind: ConversationPresetKind
  titleKey: string
  descriptionKey: string
  promptBrief: string
  safetyClass: SceneSafetyClass
  anchor?: {
    key: string
    labelKey: string
    placeholderKey: string
    helpKey: string
    maxLength: number
    multiline?: boolean
  }
}

export const CONVERSATION_PRESETS = [
  {
    id: 'cafe-moment',
    kind: 'instant',
    titleKey: 'scene.preset.cafe.title',
    descriptionKey: 'scene.preset.cafe.description',
    promptBrief: 'An ordinary café encounter. It may involve ordering, waiting, sharing the space, or a natural conversation, but must not force a purchase task or a problem.',
    safetyClass: 'normal',
  },
  {
    id: 'hotel-arrival',
    kind: 'instant',
    titleKey: 'scene.preset.hotel.title',
    descriptionKey: 'scene.preset.hotel.description',
    promptBrief: 'A hotel or guesthouse arrival with a believable person and open social affordances. Do not turn it into a scripted checklist or manufacture a complaint.',
    safetyClass: 'normal',
  },
  {
    id: 'new-colleague',
    kind: 'instant',
    titleKey: 'scene.preset.colleague.title',
    descriptionKey: 'scene.preset.colleague.description',
    promptBrief: 'A first or early informal encounter with a colleague. Keep work hierarchy, relationship distance, and local workplace register plausible; this is not an interview or a performance task.',
    safetyClass: 'normal',
  },
  {
    id: 'friend-catchup',
    kind: 'instant',
    titleKey: 'scene.preset.friend.title',
    descriptionKey: 'scene.preset.friend.description',
    promptBrief: 'A normal conversation with a friend or friendly acquaintance. Calm updates, shared observations, opinions, silence, and topic wandering are all valid. No conflict is required.',
    safetyClass: 'normal',
  },
  {
    id: 'neighborhood-encounter',
    kind: 'instant',
    titleKey: 'scene.preset.neighborhood.title',
    descriptionKey: 'scene.preset.neighborhood.description',
    promptBrief: 'An ordinary neighborhood encounter with a neighbor, local regular, or community member. It should feel lived-in rather than like a public-service lesson.',
    safetyClass: 'normal',
  },
  {
    id: 'shared-interest',
    kind: 'instant',
    titleKey: 'scene.preset.interest.title',
    descriptionKey: 'scene.preset.interest.description',
    promptBrief: 'A conversation that grows from a shared interest or activity. The interest provides common ground but must not lock the dialogue to one topic or a fixed outcome.',
    safetyClass: 'normal',
  },
  {
    id: 'destination',
    kind: 'anchor',
    titleKey: 'scene.anchor.destination.title',
    descriptionKey: 'scene.anchor.destination.description',
    promptBrief: 'The learner is going to or spending time in the supplied destination. Expand it into necessary exchanges, relationships, ordinary local life, and destination-specific experiences without defaulting to airport-hotel-restaurant templates.',
    safetyClass: 'normal',
    anchor: { key: 'destination', labelKey: 'scene.anchor.detailLabel', placeholderKey: 'scene.anchor.detailPlaceholder', helpKey: 'scene.anchor.detailHelp', maxLength: 120 },
  },
  {
    id: 'new-life',
    kind: 'anchor',
    titleKey: 'scene.anchor.newLife.title',
    descriptionKey: 'scene.anchor.newLife.description',
    promptBrief: 'The learner is entering a new phase of life in the supplied place or context. Explore neighbors, housemates, classmates, local routines, communities, and ordinary social moments rather than one administrative task.',
    safetyClass: 'normal',
    anchor: { key: 'newLife', labelKey: 'scene.anchor.detailLabel', placeholderKey: 'scene.anchor.detailPlaceholder', helpKey: 'scene.anchor.detailHelp', maxLength: 240 },
  },
  {
    id: 'work-context',
    kind: 'anchor',
    titleKey: 'scene.anchor.work.title',
    descriptionKey: 'scene.anchor.work.description',
    promptBrief: 'The supplied role or industry anchors workplace relationships, informal colleague talk, collaboration, and register shifts. Do not turn it into an interview, assessment, or fixed business task.',
    safetyClass: 'normal',
    anchor: { key: 'work', labelKey: 'scene.anchor.detailLabel', placeholderKey: 'scene.anchor.detailPlaceholder', helpKey: 'scene.anchor.detailHelp', maxLength: 240 },
  },
  {
    id: 'interest-community',
    kind: 'anchor',
    titleKey: 'scene.anchor.community.title',
    descriptionKey: 'scene.anchor.community.description',
    promptBrief: 'The supplied interest or community creates shared activity, people, and natural conversation before, during, and after it. Avoid generic small talk and avoid forcing disagreement.',
    safetyClass: 'normal',
    anchor: { key: 'community', labelKey: 'scene.anchor.detailLabel', placeholderKey: 'scene.anchor.detailPlaceholder', helpKey: 'scene.anchor.detailHelp', maxLength: 240 },
  },
  {
    id: 'relationship-occasion',
    kind: 'anchor',
    titleKey: 'scene.anchor.relationship.title',
    descriptionKey: 'scene.anchor.relationship.description',
    promptBrief: 'The supplied relationship and occasion determine address, politeness, age or power distance, and plausible shared context. Keep it relational and open-ended rather than a memorized script.',
    safetyClass: 'normal',
    anchor: { key: 'relationship', labelKey: 'scene.anchor.detailLabel', placeholderKey: 'scene.anchor.detailPlaceholder', helpKey: 'scene.anchor.detailHelp', maxLength: 240 },
  },
  {
    id: 'upcoming-moment',
    kind: 'anchor',
    titleKey: 'scene.anchor.upcoming.title',
    descriptionKey: 'scene.anchor.upcoming.description',
    promptBrief: 'The supplied upcoming moment anchors people and context, but the conversation remains open and may naturally continue before or after the event. Do not add scoring or completion conditions.',
    safetyClass: 'normal',
    anchor: { key: 'upcoming', labelKey: 'scene.anchor.detailLabel', placeholderKey: 'scene.anchor.detailPlaceholder', helpKey: 'scene.anchor.detailHelp', maxLength: 360 },
  },
  {
    id: 'content-seed',
    kind: 'anchor',
    titleKey: 'scene.anchor.content.title',
    descriptionKey: 'scene.anchor.content.description',
    promptBrief: 'The learner supplies a piece of content, message, observation, or excerpt. Use it as shared context for reactions and associations, not as a comprehension quiz or a fixed discussion agenda.',
    safetyClass: 'normal',
    anchor: { key: 'content', labelKey: 'scene.anchor.detailLabel', placeholderKey: 'scene.anchor.detailPlaceholder', helpKey: 'scene.anchor.detailHelp', maxLength: 1800, multiline: true },
  },
  {
    id: 'campus-life',
    kind: 'anchor',
    titleKey: 'scene.anchor.campus.title',
    descriptionKey: 'scene.anchor.campus.description',
    promptBrief: 'The supplied school, program, or campus context can unfold into classmates, clubs, group work, office hours, housing, and ordinary campus conversation. Do not make it a test.',
    safetyClass: 'normal',
    anchor: { key: 'campus', labelKey: 'scene.anchor.detailLabel', placeholderKey: 'scene.anchor.detailPlaceholder', helpKey: 'scene.anchor.detailHelp', maxLength: 240 },
  },
  {
    id: 'important-expression',
    kind: 'anchor',
    titleKey: 'scene.anchor.important.title',
    descriptionKey: 'scene.anchor.important.description',
    promptBrief: 'A sensitive real-world communication rehearsal. Only practice how to describe, clarify, confirm understanding, ask for a qualified interpreter, or switch to human help. Never provide medical, legal, immigration, or other professional conclusions.',
    safetyClass: 'sensitive-expression-only',
    anchor: { key: 'important', labelKey: 'scene.anchor.detailLabel', placeholderKey: 'scene.anchor.detailPlaceholder', helpKey: 'scene.anchor.detailHelp', maxLength: 600, multiline: true },
  },
] as const satisfies readonly ConversationPresetDefinition[]

export type ConversationPresetId = (typeof CONVERSATION_PRESETS)[number]['id']

export function conversationPreset(id: string) {
  return CONVERSATION_PRESETS.find((item) => item.id === id)
}

export function instantConversationPresets() {
  return CONVERSATION_PRESETS.filter((item) => item.kind === 'instant')
}

export function anchorConversationPresets() {
  return CONVERSATION_PRESETS.filter((item) => item.kind === 'anchor')
}
