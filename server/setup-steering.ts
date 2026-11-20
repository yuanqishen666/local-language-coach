/** What steers which conversations are offered: recent scenes to stay away from, and what is known about the learner. */
import { rows } from './services/database.js'
import { activeMemories, practiceProfile } from './services/memory-store.js'
import { layerOf, memoriesInScope } from './memory-policy.js'
import { normalizeConversationSetup } from './ai/context.js'
import { safeJson } from './utils/json.js'

export function setupSteering(languageCode: string, now = new Date()) {
  const avoidRecent = rows<{ setupJson: string }>(`SELECT setup_json AS setupJson FROM conversations
    WHERE setup_json IS NOT NULL AND TRIM(setup_json) <> '' ORDER BY created_at DESC LIMIT 12`).map((item) => {
      const setup = normalizeConversationSetup(safeJson(item.setupJson, null))
      return setup ? { setting: setup.setting, partnerRole: setup.partnerRole, relationship: setup.relationship, topicSeed: setup.topicSeed, openingLine: setup.openingLine, openingAct: setup.openingAct } : null
    }).filter(Boolean)
  // Plans, goals, repeated mistakes and long-unpractised situations steer what is offered. Sensitive memories never do.
  const known = memoriesInScope(activeMemories(now.toISOString()), { frame: 'direct', targetLanguageCode: languageCode }).filter((memory) => !memory.sensitive)
  const profile = practiceProfile(languageCode, languageCode)
  return {
    avoidRecent,
    learner: {
      plans: known.filter((memory) => layerOf(memory.memoryType) === 'plan').slice(0, 3).map((memory) => String(memory.value)),
      goals: known.filter((memory) => layerOf(memory.memoryType) === 'learning').slice(0, 2).map((memory) => String(memory.value)),
      weakSpots: profile.weakSpots,
      restingTopics: profile.restingTopics,
    },
  }
}
