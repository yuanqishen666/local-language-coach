import type { ConversationSetup } from '../types.js'
import { aiCacheDigest } from './ai-cache-key.js'

interface TranslationCacheIdentity {
  content: string
  targetLanguageCode: string
  interfaceLocale: string
  setup: ConversationSetup | null
}

/**
 * Context remains part of the identity because the same short sentence can
 * legitimately mean something different in another role-play.
 */
export function translationCacheKey(input: TranslationCacheIdentity) {
  return aiCacheDigest({
    version: 2,
    operation: 'message_translation',
    content: input.content,
    targetLanguageCode: input.targetLanguageCode.toLowerCase(),
    interfaceLocale: input.interfaceLocale.toLowerCase(),
    setup: input.setup,
  })
}
