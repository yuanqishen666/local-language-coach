#!/usr/bin/env node
import { readFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { configPath, isConfigShape, runChecks } from './lib/doctor-core.mjs'

const args = process.argv.slice(2)
const json = args.includes('--json')
const verbose = args.includes('--verbose')
const quick = args.includes('--quick')
const repairConfig = args.includes('--repair-config')
const modeArgument = args.find((item) => item.startsWith('--mode='))
const modeIndex = args.indexOf('--mode')
const mode = modeArgument?.split('=')[1] || (modeIndex >= 0 ? args[modeIndex + 1] : undefined) || 'doctor'

async function repairBrokenConfig() {
  let source
  try { source = await readFile(configPath, 'utf8') }
  catch (error) {
    if (error instanceof Error && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return { changed: false, message: '设置文件不存在，无需修复。' }
    throw error
  }
  try {
    if (!isConfigShape(JSON.parse(source))) throw new Error('Invalid configuration shape')
    return { changed: false, message: '设置文件格式正常，无需修复。' }
  } catch {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(path.dirname(configPath), `config.json.broken-${timestamp}`)
    await rename(configPath, backup)
    return {
      changed: true,
      backup,
      message: `已将损坏的设置文件保留为 ${backup}。下次启动会创建新的默认设置；对话、词本和记忆没有被删除。`,
    }
  }
}

function icon(status) {
  if (status === 'pass') return '✓'
  if (status === 'fail') return '✗'
  if (status === 'warn') return '!'
  return '•'
}

function nextAction(report) {
  const failed = report.results.find((item) => item.status === 'fail')
  if (failed?.fix) return failed.fix
  return '运行 npm start。启动器会自动安装组件、构建应用并打开浏览器。'
}

let repair
try {
  if (repairConfig) repair = await repairBrokenConfig()
  const report = await runChecks({ mode, quick })
  if (json) {
    process.stdout.write(`${JSON.stringify({ ...report, ...(repair ? { repair } : {}) }, null, 2)}\n`)
  } else {
    console.log('语见环境检查\n')
    if (repair) console.log(`${repair.changed ? '✓' : '•'} ${repair.message}\n`)
    for (const item of report.results) {
      console.log(`${icon(item.status)} ${item.title}`)
      if (item.status === 'fail' || item.status === 'warn' || verbose) {
        if (item.detail) console.log(`  ${String(item.detail).replace(/\n/g, '\n  ')}`)
        if (item.fix) console.log(`  处理方法：${item.fix}`)
        if (item.code) console.log(`  错误编号：${item.code}`)
      }
    }
    const counts = report.results.reduce((summary, item) => ({ ...summary, [item.status]: (summary[item.status] || 0) + 1 }), {})
    console.log(`\n${counts.pass || 0} 项正常，${counts.warn || 0} 项提醒，${counts.fail || 0} 项错误。`)
    console.log(report.ok ? '\n应用具备启动条件。' : '\n应用暂时无法安全启动。')
    console.log(`\n下一步：${nextAction(report)}`)
    if (!verbose) console.log('\n需要完整技术信息时运行：npm run doctor -- --verbose')
  }
  process.exitCode = report.ok ? 0 : 1
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (json) process.stdout.write(`${JSON.stringify({ version: 1, ok: false, error: { code: 'DOCTOR_INTERNAL_ERROR', message } }, null, 2)}\n`)
  else console.error(`环境检查无法完成：${message}\n\n错误编号：DOCTOR_INTERNAL_ERROR`)
  process.exitCode = 2
}
