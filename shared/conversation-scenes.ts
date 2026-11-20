export type SceneInitiativeMode = 'FOLLOW' | 'CO_LEAD' | 'LEAD'
export type SceneSafetyClass = 'normal' | 'sensitive-expression-only'

export interface SceneParticipant {
  name: string
  role: string
  relationship: string
}

export interface LocalStyleCard {
  locale: string
  register: string
  relationshipDistance: string
  addressNorms: string[]
  turnTaking: string[]
  pragmaticNotes: string[]
  avoidPhrases: string[]
}

export interface SceneFactPolicy {
  stableFacts: string[]
  doNotAssert: string[]
  asOf: string
}

export interface SceneOrigin {
  runId: string
  presetId: string
  anchorValue: string
  backgroundId: string
  mode: 'new_encounter' | 'same_background'
  saved: boolean
}
