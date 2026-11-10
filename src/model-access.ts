import type { Router } from 'vue-router'
import { ApiError } from './api'

export const sceneDraftKey = 'local-language-coach:scene-draft'
export const conversationDraftPrefix = 'local-language-coach:conversation-draft:'

export function needsModelConfiguration(error: unknown) {
  return error instanceof ApiError && error.code === 'MODEL_CONFIGURATION_REQUIRED'
}

export function modelSettingsLocation(returnTo: string) {
  return { path: '/settings', query: { tab: 'models', reason: 'model-required', returnTo } }
}

export async function guideToModelSettings(router: Router, returnTo: string) {
  await router.push(modelSettingsLocation(returnTo))
}
