#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { getConfig, getByPath, resetConfig, saveConfig, setByPath, setSecret } from '../server/services/config.js'
import { testProvider } from '../server/ai/provider.js'
import { describeRemote, remoteQr, startRemote, stopRemote } from './remote.js'
import { normalizeUiLocale, UI_LOCALES } from '../shared/locales.js'

const args = process.argv.slice(2)
const command = args[0]

async function prompt(question: string) {
  const rl = createInterface({ input: stdin, output: stdout })
  const value = await rl.question(question)
  rl.close()
  return value.trim()
}

async function promptSecret(question: string): Promise<string> {
  if (!stdin.isTTY || !stdin.setRawMode) return prompt(question)
  stdout.write(question)
  return new Promise((resolve, reject) => {
    let value = ''
    const finish = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
      stdout.write('\n')
    }
    const onData = (chunk: Buffer | string) => {
      const input = chunk.toString()
      for (const char of input) {
        if (char === '\u0003') { finish(); reject(new Error('Cancelled')); return }
        if (char === '\r' || char === '\n') { finish(); resolve(value); return }
        if (char === '\u007f' || char === '\b') { value = value.slice(0, -1); continue }
        value += char
      }
    }
    stdin.setEncoding('utf8')
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

function parseValue(input: string) {
  if (input === 'true') return true
  if (input === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(input)) return Number(input)
  return input
}

async function main() {
  if (!command || command === 'help') {
    console.log(`Local Language Coach

npm run app -- setup
npm run app -- config list
npm run app -- config get learning.targetLanguage
npm run app -- config set learning.targetLanguage English
npm run app -- config reset
npm run app -- secret set providers.deepseek.apiKey   # prompts; never put keys in args
npm run app -- provider test deepseek
npm run app -- provider verify deepseek                # test and save capability
npm run app -- remote start                            # prompts for allowed email
npm run app -- remote status
npm run app -- remote stop
npm run doctor`)
    return
  }
  if (command === 'setup') {
    const config = await getConfig()
    const locale = await prompt(`Interface locale [${UI_LOCALES.join('/')}] (zh-CN): `)
    const language = await prompt('Target language / 学习语言 (English): ')
    const code = await prompt('BCP-47 language code (en): ')
    const level = await prompt('Level [A2/B1/B2] (B1): ')
    config.ui.locale = normalizeUiLocale(locale || 'zh-CN')
    config.learning.targetLanguage = language || 'English'
    config.learning.targetLanguageCode = code || 'en'
    config.learning.proficiency = level || 'B1'
    config.setupComplete = true
    await saveConfig(config)
    console.log('Saved. Run: npm start')
    return
  }
  if (command === 'config') {
    const config = await getConfig()
    if (args[1] === 'list') console.log(JSON.stringify(config, null, 2))
    else if (args[1] === 'get' && args[2]) console.log(JSON.stringify(getByPath(config, args[2]), null, 2))
    else if (args[1] === 'set' && args[2] && args[3] !== undefined) { setByPath(config, args[2], parseValue(args.slice(3).join(' '))); await saveConfig(config); console.log(`Updated ${args[2]}`) }
    else if (args[1] === 'reset') { await resetConfig({ clearSecrets: true }); console.log('Configuration reset and API keys removed. Learning data was preserved.') }
    else throw new Error('Usage: npm run app -- config list|get <path>|set <path> <value>|reset')
    return
  }
  if (command === 'secret' && args[1] === 'set' && args[2]) {
    if (args[3]) throw new Error('For safety, do not pass secret values as command arguments.')
    const value = await promptSecret(`Enter ${args[2]} (hidden): `)
    await setSecret(args[2], value)
    console.log('Secret saved locally in data/secrets.json (mode 0600).')
    return
  }
  if (command === 'provider' && args[1] === 'test' && args[2]) {
    console.log(await testProvider(args[2]))
    return
  }
  if (command === 'provider' && args[1] === 'verify' && args[2]) {
    const result = await testProvider(args[2])
    const config = await getConfig()
    const provider = config.providers.find((item) => item.id === args[2])
    if (!provider) throw new Error('Provider not found')
    provider.capability = result.capability
    provider.enabled = true
    await saveConfig(config)
    console.log({ ...result, saved: true })
    return
  }
  if (command === 'remote') {
    const action = args[1]
    if (action === 'start') {
      let emails = args.slice(2)
      const current = await describeRemote()
      if (!current.active && !emails.length) {
        if (!stdin.isTTY) throw new Error('Usage: npm run app -- remote start <allowed-email>')
        const answer = await prompt('允许访问的邮箱（多个邮箱用英文逗号分隔）: ')
        emails = [answer]
      }
      console.log('正在创建受邮箱验证码保护的临时访问地址…')
      const state = await startRemote(emails, (message) => console.log(message))
      console.log(`\n手机访问地址：${state.url}`)
      console.log(`允许的邮箱：${state.allowedEmails.join(', ')}`)
      console.log('此地址是临时的；电脑、应用服务和远程访问进程都必须保持运行。')
      console.log('停止命令：npm run app -- remote stop\n')
      console.log(await remoteQr(state.url))
      return
    }
    if (action === 'status') {
      const status = await describeRemote()
      if (!status.active) {
        console.log('Remote access: stopped (the app still works locally).')
      } else {
        console.log(`Remote access: running\nURL: ${status.url}\nAllowed email: ${status.allowedEmails.join(', ')}\nStarted: ${status.startedAt}\nHelper: ${status.versionLabel}`)
      }
      return
    }
    if (action === 'stop') { console.log((await stopRemote()).message); return }
    throw new Error('Usage: npm run app -- remote start [allowed-email] | status | stop')
  }
  if (command === 'doctor') {
    const doctor = spawn(process.execPath, [path.resolve(process.cwd(), 'scripts/doctor.mjs'), ...args.slice(1)], { stdio: 'inherit' })
    const exitCode = await new Promise<number>((resolve, reject) => {
      doctor.once('error', reject)
      doctor.once('exit', (code) => resolve(code ?? 1))
    })
    if (exitCode !== 0) process.exitCode = exitCode
    return
  }
  throw new Error('Unknown command. Run: npm run app -- help')
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
