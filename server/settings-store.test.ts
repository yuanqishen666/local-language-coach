import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AppConfig } from './types.js'

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'yujian-settings-store-test-'))
process.env.NODE_ENV = 'test'
process.env.LLC_DATA_DIR = dataDirectory
const { getConfig, getSecrets, keepSettingsWith, saveConfig, saveConfigAndSecrets, setSecret } = await import('./services/config.js')
type Store = NonNullable<ReturnType<Parameters<typeof keepSettingsWith>[0]>>

after(async () => {
  keepSettingsWith(() => undefined)
  await rm(dataDirectory, { recursive: true, force: true })
})

/** Settings and keys held in memory, starting from a copy of `config`. */
function inMemory(config: AppConfig): Store & { saved: number } {
  let secrets: Record<string, string> = {}
  const store = {
    saved: 0,
    config: async () => structuredClone(config),
    saveConfig: async (next: AppConfig) => { config = structuredClone(next); store.saved += 1; return next },
    saveConfigAndSecrets: async (next: AppConfig, keys: Record<string, string>) => { config = structuredClone(next); secrets = { ...keys }; store.saved += 1; return next },
    secrets: async () => ({ ...secrets }),
    setSecret: async (key: string, value: string) => { secrets[key] = value },
  }
  return store
}

const inFile = async () => JSON.parse(await readFile(path.join(dataDirectory, 'config.json'), 'utf8')) as AppConfig

test('settings and keys are kept in the data folder until the hosting program keeps them elsewhere', async () => {
  const config = await getConfig()
  await saveConfig({ ...config, ui: { locale: 'en-US' } })
  assert.equal((await inFile()).ui.locale, 'en-US')

  const store = inMemory({ ...config, ui: { locale: 'ja-JP' } })
  keepSettingsWith(() => store)
  assert.equal((await getConfig()).ui.locale, 'ja-JP')
  await saveConfig({ ...(await getConfig()), ui: { locale: 'ko-KR' } })
  await setSecret('providers.openai.apiKey', 'kept-elsewhere')
  assert.equal((await getConfig()).ui.locale, 'ko-KR')
  assert.deepEqual(await getSecrets(), { 'providers.openai.apiKey': 'kept-elsewhere' })
  assert.equal((await inFile()).ui.locale, 'en-US', 'the files are left as they were')

  keepSettingsWith(() => undefined)
  assert.equal((await getConfig()).ui.locale, 'en-US', 'keeping them nowhere else means the files')
  assert.deepEqual(await getSecrets(), {})
})

test('settings that are not valid never reach the place they are kept', async () => {
  const config = await getConfig()
  const store = inMemory(config)
  keepSettingsWith(() => store)
  await assert.rejects(saveConfig({ ...config, ui: { locale: 'xx-XX' as AppConfig['ui']['locale'] } }), /Unsupported interface locale/u)
  await assert.rejects(saveConfigAndSecrets(config, { 'providers.openai.apiKey': 1 as unknown as string }), /every secret value/u)
  assert.equal(store.saved, 0)
  keepSettingsWith(() => undefined)
})

test('work for two learners that overlaps in time reads and writes its own settings', async () => {
  const config = await getConfig()
  const inHand = new AsyncLocalStorage<Store>()
  keepSettingsWith(() => inHand.getStore())
  const pause = () => new Promise((resolve) => setTimeout(resolve, 5))

  async function choose(locale: AppConfig['ui']['locale']) {
    await saveConfig({ ...(await getConfig()), ui: { locale } })
    await pause()
    return (await getConfig()).ui.locale
  }

  const [left, right] = await Promise.all([
    inHand.run(inMemory(config), () => choose('fr-FR')),
    inHand.run(inMemory(config), () => choose('de-DE')),
  ])
  assert.deepEqual([left, right], ['fr-FR', 'de-DE'])
  assert.equal((await getConfig()).ui.locale, 'en-US')
  keepSettingsWith(() => undefined)
})
