/**
 * Learners sharing this computer. Each has a database file of their own, so conversations, memories,
 * words and level never mix; model providers, keys and the record of what was spent are shared.
 *
 * The learner the app was first used by keeps the original file, so nothing is moved when a second
 * learner is added.
 */
import { rm } from 'node:fs/promises'
import { customAlphabet } from 'nanoid'
import type { FastifyInstance } from 'fastify'
import { TARGET_LANGUAGES, targetLanguage } from '../shared/locales.js'
import { DEFAULT_PROFILE_ID, MAX_PROFILES, defaultConfig, getConfig, saveConfig } from './services/config.js'
import { databaseFile, useDatabase } from './services/database.js'
import type { AppConfig, LearnerProfile } from './types.js'

const newId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10)
const NAME_LIMIT = 40

let active = DEFAULT_PROFILE_ID

/** The learner whose database is open. */
export function activeProfileId() {
  return active
}

function fileOf(id: string) {
  return databaseFile(id === DEFAULT_PROFILE_ID ? 'app.db' : `profile-${id}.db`)
}

function storedProfiles(config: AppConfig): LearnerProfile[] {
  return config.profiles?.length ? config.profiles : [{ id: DEFAULT_PROFILE_ID, name: '', createdAt: '' }]
}

function activeIn(config: AppConfig) {
  const profiles = storedProfiles(config)
  return profiles.find((profile) => profile.id === config.activeProfile)?.id || profiles[0].id
}

/** Opens the database of the learner the configuration names. Called at startup and after settings are reset. */
export async function openActiveProfile() {
  const id = activeIn(await getConfig())
  if (id === active) return
  useDatabase(fileOf(id))
  active = id
}

function profilesPayload(config: AppConfig) {
  const current = activeIn(config)
  return {
    max: MAX_PROFILES,
    profiles: storedProfiles(config).map((profile) => ({
      id: profile.id,
      name: profile.name,
      createdAt: profile.createdAt,
      active: profile.id === current,
      targetLanguageCode: profile.id === current ? config.learning.targetLanguageCode : profile.learning?.targetLanguageCode || '',
    })),
  }
}

function fail(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code })
}

function cleanName(value: unknown) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : ''
  if (!name || name.length > NAME_LIMIT) throw fail('A profile needs a name of at most 40 characters.', 400, 'PROFILE_NAME_INVALID')
  return name
}

function withoutRequestFields(learning: AppConfig['learning']) {
  const { difficultyStep: _difficultyStep, ...kept } = learning
  return kept
}

export function registerProfileRoutes(app: FastifyInstance, options: { busy: () => boolean }) {
  app.get('/api/profiles', async () => profilesPayload(await getConfig()))

  app.post<{ Body: { name?: string; targetLanguageCode?: string } }>('/api/profiles', async (request) => {
    const config = await getConfig()
    const profiles = storedProfiles(config)
    if (profiles.length >= MAX_PROFILES) throw fail('No more profiles can be added.', 409, 'PROFILE_LIMIT')
    const name = cleanName(request.body?.name)
    if (profiles.some((profile) => profile.name.toLowerCase() === name.toLowerCase())) throw fail('A profile with this name exists.', 409, 'PROFILE_NAME_TAKEN')
    const code = TARGET_LANGUAGES.some((language) => language.code === request.body?.targetLanguageCode)
      ? String(request.body.targetLanguageCode)
      : config.learning.targetLanguageCode
    let id = newId()
    while (profiles.some((profile) => profile.id === id)) id = newId()
    const created: LearnerProfile = {
      id,
      name,
      createdAt: new Date().toISOString(),
      learning: { ...defaultConfig.learning, targetLanguage: targetLanguage(code).name, targetLanguageCode: code },
      uiLocale: config.ui.locale,
    }
    const next = await saveConfig({ ...config, profiles: [...profiles, created], activeProfile: activeIn(config) })
    return { id, ...profilesPayload(next) }
  })

  app.patch<{ Params: { id: string }; Body: { name?: string } }>('/api/profiles/:id', async (request) => {
    const config = await getConfig()
    const profiles = storedProfiles(config)
    if (!profiles.some((profile) => profile.id === request.params.id)) throw fail('Profile not found', 404, 'PROFILE_NOT_FOUND')
    const name = cleanName(request.body?.name)
    if (profiles.some((profile) => profile.id !== request.params.id && profile.name.toLowerCase() === name.toLowerCase())) throw fail('A profile with this name exists.', 409, 'PROFILE_NAME_TAKEN')
    const next = await saveConfig({
      ...config,
      profiles: profiles.map((profile) => profile.id === request.params.id ? { ...profile, name } : profile),
      activeProfile: activeIn(config),
    })
    return profilesPayload(next)
  })

  app.post<{ Params: { id: string } }>('/api/profiles/:id/activate', async (request) => {
    const config = await getConfig()
    const profiles = storedProfiles(config)
    const current = activeIn(config)
    const target = profiles.find((profile) => profile.id === request.params.id)
    if (!target) throw fail('Profile not found', 404, 'PROFILE_NOT_FOUND')
    if (target.id === current) return profilesPayload(config)
    if (options.busy()) throw fail('A reply is still being written. Switch once it has arrived.', 409, 'PROFILE_BUSY')
    // The learner stepping away keeps their settings in their entry; the one arriving takes theirs out of it.
    const next: AppConfig = {
      ...config,
      profiles: profiles.map((profile) => profile.id === current
        ? { ...profile, learning: withoutRequestFields(config.learning), uiLocale: config.ui.locale }
        : profile.id === target.id ? { id: profile.id, name: profile.name, createdAt: profile.createdAt } : profile),
      activeProfile: target.id,
      learning: target.learning ? withoutRequestFields(target.learning) : withoutRequestFields(config.learning),
      ui: { ...config.ui, locale: target.uiLocale || config.ui.locale },
    }
    useDatabase(fileOf(target.id))
    try {
      const saved = await saveConfig(next)
      active = target.id
      return profilesPayload(saved)
    } catch (error) {
      useDatabase(fileOf(current))
      throw error
    }
  })

  app.delete<{ Params: { id: string } }>('/api/profiles/:id', async (request) => {
    const config = await getConfig()
    const profiles = storedProfiles(config)
    const target = profiles.find((profile) => profile.id === request.params.id)
    if (!target) throw fail('Profile not found', 404, 'PROFILE_NOT_FOUND')
    if (target.id === activeIn(config)) throw fail('The profile in use cannot be deleted. Switch to another first.', 409, 'PROFILE_IN_USE')
    const next = await saveConfig({ ...config, profiles: profiles.filter((profile) => profile.id !== target.id), activeProfile: activeIn(config) })
    const file = fileOf(target.id)
    await Promise.all([file, `${file}-wal`, `${file}-shm`].map((item) => rm(item, { force: true })))
    return profilesPayload(next)
  })
}
