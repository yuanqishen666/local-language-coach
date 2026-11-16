import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'llc-config-transaction-'))
process.env.LLC_DATA_DIR = dataDir

const configService = await import('./services/config.js')

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true })
})

test('provider configuration and secrets are persisted through one recoverable transaction', async () => {
  const next = structuredClone(configService.defaultConfig)
  const provider = next.providers.find((item) => item.id === 'deepseek')!
  provider.enabled = true
  provider.model = 'deepseek-chat'
  provider.modelProfiles = {
    'deepseek-chat': { contextWindowTokens: 64_000, maxOutputTokens: 8_000 },
  }

  await configService.saveConfigAndSecrets(next, { [provider.apiKeySecret]: 'secret-value' })

  assert.equal((await configService.getConfig()).providers.find((item) => item.id === 'deepseek')?.model, 'deepseek-chat')
  assert.equal((await configService.getSecrets())[provider.apiKeySecret], 'secret-value')
  await assert.rejects(access(path.join(dataDir, 'provider-save.transaction.json')))
})

test('a pending provider transaction is completed before configuration is read', async () => {
  const next = structuredClone(configService.defaultConfig)
  next.ui.locale = 'en-US'
  const secrets = { 'providers.openai.apiKey': 'recovered-secret' }
  await writeFile(path.join(dataDir, 'provider-save.transaction.json'), `${JSON.stringify({
    version: 1,
    config: next,
    secrets,
  })}\n`, { mode: 0o600 })

  // A new module instance models a restarted process whose first read performs recovery.
  const restarted = await import(`./services/config.js?recovery=${Date.now()}`)
  assert.equal((await restarted.getConfig()).ui.locale, 'en-US')
  assert.deepEqual(await restarted.getSecrets(), secrets)
  await assert.rejects(access(path.join(dataDir, 'provider-save.transaction.json')))
  assert.equal(JSON.parse(await readFile(path.join(dataDir, 'config.json'), 'utf8')).ui.locale, 'en-US')
})
