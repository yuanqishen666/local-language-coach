import { constants, copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { AppConfig, ProviderConfig } from '../types.js'
import { UI_LOCALES } from '../../shared/locales.js'

const root = process.env.LLC_DATA_DIR || path.resolve(process.cwd(), 'data')
const configPath = path.join(root, 'config.json')
const secretsPath = path.join(root, 'secrets.json')

const providerDefaults: ProviderConfig[] = [
  { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', apiKeySecret: 'providers.openai.apiKey', enabled: false, contextWindowTokens: 32_768, maxOutputTokens: 1_200, modelProfiles: {} },
  { id: 'anthropic', name: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: '', apiKeySecret: 'providers.anthropic.apiKey', enabled: false, contextWindowTokens: 32_768, maxOutputTokens: 1_200, modelProfiles: {} },
  { id: 'gemini', name: 'Google Gemini', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: '', apiKeySecret: 'providers.gemini.apiKey', enabled: false, contextWindowTokens: 32_768, maxOutputTokens: 1_200, modelProfiles: {} },
  { id: 'deepseek', name: 'DeepSeek', kind: 'deepseek', baseUrl: 'https://api.deepseek.com', model: '', apiKeySecret: 'providers.deepseek.apiKey', enabled: false, contextWindowTokens: 32_768, maxOutputTokens: 1_200, modelProfiles: {} },
  { id: 'kimi', name: 'Moonshot / Kimi', kind: 'kimi', baseUrl: 'https://api.moonshot.ai/v1', model: '', apiKeySecret: 'providers.kimi.apiKey', enabled: false, contextWindowTokens: 32_768, maxOutputTokens: 1_200, modelProfiles: {} },
]

export const defaultConfig: AppConfig = {
  setupComplete: false,
  ui: { locale: 'zh-CN' },
  learning: { targetLanguage: 'English', targetLanguageCode: 'en', proficiency: 'B1', correctionLevel: 'balanced' },
  llm: { defaultProvider: '', temperature: 0.7 },
  webLookup: { enabled: false, provider: 'selected', timeoutMs: 8_000, maxResults: 5 },
  server: { host: '127.0.0.1', port: 4174 },
  providers: providerDefaults,
}

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
  return value as Record<string, any>
}

/** Validate the only supported configuration shape. This deliberately does
 * not migrate, fill, rename, or preserve fields from earlier schemas. */
export function validateConfig(input: AppConfig): AppConfig {
  const value = record(input)
  const ui = record(value.ui)
  const learning = record(value.learning)
  const llm = record(value.llm)
  const webLookup = record(value.webLookup)
  const server = record(value.server)
  if (typeof value.setupComplete !== 'boolean') throw new Error('setupComplete must be boolean')
  if (!UI_LOCALES.includes(ui.locale)) throw new Error('Unsupported interface locale')
  if (typeof learning.targetLanguage !== 'string' || typeof learning.targetLanguageCode !== 'string' || typeof learning.proficiency !== 'string') throw new Error('Learning preferences are incomplete')
  if (!['light', 'balanced', 'intensive'].includes(learning.correctionLevel)) throw new Error('Unsupported correction level')
  if (!Number.isFinite(llm.temperature) || typeof llm.defaultProvider !== 'string') throw new Error('Model settings are incomplete')
  if (webLookup.provider !== 'selected' || typeof webLookup.enabled !== 'boolean') throw new Error('Web lookup settings are invalid')
  if (!Number.isInteger(webLookup.timeoutMs) || webLookup.timeoutMs < 2_000 || webLookup.timeoutMs > 20_000) throw new Error('Web lookup timeout is invalid')
  if (!Number.isInteger(webLookup.maxResults) || webLookup.maxResults < 1 || webLookup.maxResults > 10) throw new Error('Web lookup result limit is invalid')
  if (typeof server.host !== 'string' || !Number.isInteger(server.port)) throw new Error('Server settings are invalid')
  if (!Array.isArray(value.providers) || value.providers.length !== providerDefaults.length) throw new Error('The provider list does not match the current schema')

  const providers = providerDefaults.map((expected) => {
    const provider = record(value.providers.find((item: ProviderConfig) => item?.id === expected.id)) as ProviderConfig
    if (provider.name !== expected.name || provider.kind !== expected.kind || provider.baseUrl !== expected.baseUrl || provider.apiKeySecret !== expected.apiKeySecret) {
      throw new Error(`Provider identity is invalid: ${expected.id}`)
    }
    if (typeof provider.model !== 'string' || typeof provider.enabled !== 'boolean') throw new Error(`Provider settings are incomplete: ${expected.id}`)
    if (provider.model.length > 200 || ['__proto__', 'prototype', 'constructor'].includes(provider.model.trim()) ||
      ((provider.enabled || provider.capability) && !provider.model.trim())) throw new Error(`Provider model is invalid: ${expected.id}`)
    if (!Number.isInteger(provider.contextWindowTokens) || provider.contextWindowTokens < 4_096) throw new Error(`Context window is invalid: ${expected.id}`)
    if (!Number.isInteger(provider.maxOutputTokens) || provider.maxOutputTokens < 256) throw new Error(`Output limit is invalid: ${expected.id}`)
    if (provider.modelProfiles !== undefined) {
      const profiles = record(provider.modelProfiles)
      for (const [model, profileValue] of Object.entries(profiles)) {
        const profile = record(profileValue)
        if (!model.trim() || model.length > 200 || ['__proto__', 'prototype', 'constructor'].includes(model)) throw new Error(`Saved model name is invalid: ${expected.id}`)
        if (!Number.isInteger(profile.contextWindowTokens) || profile.contextWindowTokens < 4_096) throw new Error(`Saved model context window is invalid: ${expected.id}`)
        if (!Number.isInteger(profile.maxOutputTokens) || profile.maxOutputTokens < 256) throw new Error(`Saved model output limit is invalid: ${expected.id}`)
      }
    }
    if (provider.capability) {
      const capability = provider.capability
      if (capability.conversationReady !== true || capability.lookupReady !== true || capability.contractVersion !== 6 ||
        capability.baseUrl.replace(/\/$/, '') !== provider.baseUrl.replace(/\/$/, '') || capability.model !== provider.model ||
        !['json_schema', 'json_object', 'prompt_json'].includes(capability.outputMode) || typeof capability.testedAt !== 'string') {
        throw new Error(`Provider capability is stale or invalid: ${expected.id}`)
      }
    }
    return structuredClone(provider)
  })
  if (llm.defaultProvider && !providers.some((provider) => provider.id === llm.defaultProvider)) throw new Error('Default provider is invalid')
  return structuredClone(input)
}

async function ensureRoot() {
  await mkdir(root, { recursive: true, mode: 0o700 })
}

async function atomicJson(file: string, data: unknown, mode = 0o600) {
  await ensureRoot()
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode })
  await rename(tmp, file)
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

async function invalidJsonError(file: string, label: string, cause: unknown) {
  const fileStat = await stat(file).catch(() => undefined)
  const timestamp = new Date(fileStat?.mtimeMs || Date.now()).toISOString().replace(/[:.]/g, '-')
  const backupPath = `${file}.broken-${timestamp}`
  await copyFile(file, backupPath, constants.COPYFILE_EXCL).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error
  })
  return Object.assign(
    new Error(`${label} is invalid. The original file was preserved and backed up to ${backupPath}. Run "npm run doctor" for repair instructions.`, { cause }),
    { code: 'LOCAL_CONFIG_INVALID', backupPath },
  )
}

export async function getConfig(): Promise<AppConfig> {
  await ensureRoot()
  let source: string
  try {
    source = await readFile(configPath, 'utf8')
  } catch (error) {
    if (!isMissingFile(error)) throw error
    await atomicJson(configPath, defaultConfig)
    return structuredClone(defaultConfig)
  }
  let value: AppConfig
  let validated: AppConfig
  try {
    value = JSON.parse(source) as AppConfig
    validated = validateConfig(value)
  } catch (error) {
    throw await invalidJsonError(configPath, 'Local configuration', error)
  }
  return validated
}

export async function saveConfig(config: AppConfig) {
  const validated = validateConfig(config)
  await atomicJson(configPath, validated)
  return validated
}

export async function resetConfig(options: { clearSecrets?: boolean } = {}) {
  const next = structuredClone(defaultConfig)
  await atomicJson(configPath, next)
  if (options.clearSecrets) await atomicJson(secretsPath, {})
  return next
}

export async function getSecrets(): Promise<Record<string, string>> {
  await ensureRoot()
  let source: string
  try {
    source = await readFile(secretsPath, 'utf8')
  } catch (error) {
    if (!isMissingFile(error)) throw error
    await atomicJson(secretsPath, {})
    return {}
  }
  try {
    const value = JSON.parse(source) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object')
    if (Object.values(value).some((secret) => typeof secret !== 'string')) throw new Error('Expected every secret value to be a string')
    return value as Record<string, string>
  } catch (error) {
    throw await invalidJsonError(secretsPath, 'Local secrets file', error)
  }
}

export async function setSecret(key: string, value: string) {
  const secrets = await getSecrets()
  if (value) secrets[key] = value
  else delete secrets[key]
  await atomicJson(secretsPath, secrets)
}

export function getByPath(object: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, object)
}

export function setByPath(object: object, dotted: string, value: unknown) {
  const parts = dotted.split('.')
  let current = object as Record<string, unknown>
  parts.slice(0, -1).forEach((part) => {
    if (!current[part] || typeof current[part] !== 'object') current[part] = {}
    current = current[part] as Record<string, unknown>
  })
  current[parts.at(-1)!] = value
}

export const dataRoot = root
