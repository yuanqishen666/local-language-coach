#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { appendFile, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  configuredPort,
  dataRoot,
  findAvailablePort,
  healthAt,
  packageManifest,
  projectRoot,
  runChecks,
  runtimePath,
} from './lib/doctor-core.mjs'

const args = process.argv.slice(2)
const requestedMode = args.find((item) => !item.startsWith('-')) || 'start'
const mode = ['start', 'dev', 'build'].includes(requestedMode) ? requestedMode : 'start'
const forceBuild = args.includes('--rebuild')
const packageManager = String(packageManifest.packageManager || 'pnpm@11.9.0')
const noBrowser = process.env.LLC_NO_OPEN === '1' || Boolean(process.env.CI)
let logStream

function redact(value) {
  return String(value)
    .replace(/\/\/[^/@\s:]+:[^/@\s]+@/g, '//[REDACTED]@')
    .replace(/((?:api[_-]?key|authorization|x-api-key)["'=:\s]+)[^\s,}]+/gi, '$1[REDACTED]')
}

function log(message = '') {
  console.log(message)
  logStream?.write(`${redact(message)}\n`)
}

async function prepareLog() {
  const directory = path.join(dataRoot, 'logs')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(directory, `bootstrap-${timestamp}.log`)
  logStream = createWriteStream(file, { flags: 'a', mode: 0o600 })
  logStream.write(`Local Language Coach bootstrap\nmode=${mode}\nnode=${process.version}\nplatform=${process.platform}/${process.arch}\n`)
  const files = (await readdir(directory)).filter((name) => name.startsWith('bootstrap-') && name.endsWith('.log')).sort().reverse()
  await Promise.all(files.slice(5).map((name) => unlink(path.join(directory, name)).catch(() => {})))
  return file
}

function renderFailure(item, logFile) {
  console.error(`\n无法启动：${item.title}\n`)
  if (item.detail) console.error(`${item.detail}\n`)
  if (item.fix) console.error(`请按下面的方法处理：\n${item.fix}\n`)
  if (item.code) console.error(`错误编号：${item.code}`)
  if (logFile) console.error(`诊断日志：${logFile}`)
  console.error('\n完整检查：npm run doctor -- --verbose')
}

function spawnPnpm(argumentsList, options = {}) {
  const npmArguments = ['exec', '--yes', `--package=${packageManager}`, '--', 'pnpm', ...argumentsList]
  const npmExecPath = process.env.npm_execpath
  const launchedByPnpm = Boolean(npmExecPath && /(?:^|[/\\])pnpm(?:\.cjs)?$/i.test(npmExecPath))
  const command = launchedByPnpm || npmExecPath ? process.execPath : process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm'
  const commandArguments = launchedByPnpm
    ? [npmExecPath, ...argumentsList]
    : npmExecPath
      ? [npmExecPath, ...npmArguments]
    : process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm', ...npmArguments]
      : npmArguments
  const child = spawn(command, commandArguments, {
    cwd: projectRoot,
    env: { ...process.env, PNPM_CONFIG_UPDATE_NOTIFIER: 'false', NO_UPDATE_NOTIFIER: '1', ...options.env },
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.diagnosticOutput = ''
  child.stdout.on('data', (chunk) => {
    if (!options.quiet) process.stdout.write(chunk)
    const safe = redact(chunk)
    child.diagnosticOutput = `${child.diagnosticOutput}${safe}`.slice(-100_000)
    logStream?.write(safe)
  })
  child.stderr.on('data', (chunk) => {
    if (!options.quiet) process.stderr.write(chunk)
    const safe = redact(chunk)
    child.diagnosticOutput = `${child.diagnosticOutput}${safe}`.slice(-100_000)
    logStream?.write(safe)
  })
  return child
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve({ code: child.exitCode ?? 1, signal: child.signalCode })
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code: code ?? (signal ? 1 : 0), signal }))
  })
}

async function runPnpm(argumentsList, options = {}) {
  const child = spawnPnpm(argumentsList, options)
  const result = await waitForExit(child)
  if (result.code !== 0) {
    throw Object.assign(new Error(`pnpm ${argumentsList.join(' ')} failed with exit code ${result.code}`), {
      code: options.errorCode || 'PROJECT_COMMAND_FAILED',
      exitCode: result.code,
      diagnosticOutput: child.diagnosticOutput,
    })
  }
}

function renderInstallFailure(error, logFile) {
  const output = String(error?.diagnosticOutput || '')
  console.error('\n无法准备应用组件。\n')
  if (/ERR_PNPM_OUTDATED_LOCKFILE|frozen lockfile|frozen-lockfile/i.test(output)) {
    console.error('项目的 package.json 与 pnpm-lock.yaml 不一致。通常是下载不完整、文件被手动修改，或仓库本身漏交了锁文件更新。')
    console.error('\n请重新下载一份干净的项目代码后再运行 npm start；不要用忽略锁文件的参数强行安装。')
    console.error('\n错误编号：DEPENDENCY_LOCKFILE_MISMATCH')
  } else if (/EACCES|EPERM|permission denied/i.test(output)) {
    console.error('当前用户没有权限写入项目目录或软件包缓存。')
    console.error('\n请把项目移动到“文档”或个人项目目录后重新运行 npm start。不要使用 sudo 启动应用。')
    console.error('\n错误编号：DEPENDENCY_PERMISSION_DENIED')
  } else if (/ENOTFOUND|ECONN|ETIMEDOUT|ERR_PNPM_FETCH|certificate|network|socket/i.test(output)) {
    console.error('当前无法连接软件包下载服务。请确认浏览器可以联网；如果使用代理或 VPN，也要确保终端可以使用该网络。')
    console.error('\n等待几分钟后重新运行：\n\n  npm start')
    console.error('\n错误编号：DEPENDENCY_DOWNLOAD_FAILED')
  } else {
    console.error('安装过程返回了未识别的错误。没有删除本地数据，也没有修改 API Key。')
    console.error('\n请重新运行 npm start；如果仍然失败，请在提交 Issue 时附上下面的诊断日志。')
    console.error(`\n错误编号：${error?.code || 'DEPENDENCY_INSTALL_FAILED'}`)
  }
  if (logFile) console.error(`诊断日志：${logFile}`)
}

async function sourceFiles() {
  const roots = ['src', 'server', 'shared', 'cli']
  const files = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'vite.config.ts', 'tsconfig.json', 'tsconfig.server.json', 'index.html']
  async function visit(relative) {
    const absolute = path.join(projectRoot, relative)
    let entryStat
    try { entryStat = await stat(absolute) } catch { return }
    if (entryStat.isDirectory()) {
      const children = await readdir(absolute)
      for (const child of children.sort()) await visit(path.join(relative, child))
    } else if (entryStat.isFile()) {
      files.push(relative)
    }
  }
  for (const root of roots) await visit(root)
  return [...new Set(files)].sort()
}

async function buildFingerprint() {
  const hash = createHash('sha256')
  for (const relative of await sourceFiles()) {
    hash.update(relative)
    hash.update(await readFile(path.join(projectRoot, relative)))
  }
  return hash.digest('hex')
}

async function buildIsCurrent(fingerprint) {
  try {
    const metadata = JSON.parse(await readFile(path.join(projectRoot, 'dist', '.llc-build.json'), 'utf8'))
    await Promise.all([
      stat(path.join(projectRoot, 'dist', 'web', 'index.html')),
      stat(path.join(projectRoot, 'dist', 'server', 'server', 'index.js')),
    ])
    return metadata.fingerprint === fingerprint
  } catch { return false }
}

async function ensureBuild(force = false) {
  const fingerprint = await buildFingerprint()
  if (!force && await buildIsCurrent(fingerprint)) {
    log('      ✓ 应用已经是最新状态')
    return
  }
  log('      正在构建本地应用…')
  await runPnpm(['run', 'internal:build'], { errorCode: 'APPLICATION_BUILD_FAILED', quiet: true })
  await writeFile(path.join(projectRoot, 'dist', '.llc-build.json'), `${JSON.stringify({ version: 1, fingerprint, builtAt: new Date().toISOString() }, null, 2)}\n`)
  log('      ✓ 应用构建完成')
}

async function waitForUrl(url, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw Object.assign(new Error('The application process exited before it became ready'), { code: 'APPLICATION_START_FAILED' })
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1_000) })
      const body = response.ok ? await response.json() : null
      if (body?.app === 'local-language-coach' && body?.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw Object.assign(new Error(`The application did not become ready within ${Math.round(timeoutMs / 1000)} seconds`), { code: 'APPLICATION_START_TIMEOUT' })
}

async function waitForWeb(url, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw Object.assign(new Error('The development process exited before it became ready'), { code: 'APPLICATION_START_FAILED' })
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw Object.assign(new Error(`The development server did not become ready within ${Math.round(timeoutMs / 1000)} seconds`), { code: 'APPLICATION_START_TIMEOUT' })
}

function openBrowser(url) {
  if (noBrowser) return false
  let command
  let browserArgs
  if (process.platform === 'darwin') { command = 'open'; browserArgs = [url] }
  else if (process.platform === 'win32') { command = 'cmd'; browserArgs = ['/c', 'start', '', url] }
  else { command = 'xdg-open'; browserArgs = [url] }
  try {
    const opener = spawn(command, browserArgs, { detached: true, stdio: 'ignore', windowsHide: true })
    opener.unref()
    return true
  } catch { return false }
}

async function clearRuntime(url) {
  try {
    const current = JSON.parse(await readFile(runtimePath, 'utf8'))
    if (current.url === url) await unlink(runtimePath)
  } catch {}
}

async function clearStaleRuntime() {
  try {
    const current = JSON.parse(await readFile(runtimePath, 'utf8'))
    if (!Number.isInteger(current.pid) || current.pid <= 0) { await unlink(runtimePath); return }
    try { process.kill(current.pid, 0) } catch { await unlink(runtimePath) }
  } catch {}
}

async function runningFromRuntime() {
  try {
    const current = JSON.parse(await readFile(runtimePath, 'utf8'))
    if (!Number.isInteger(current.port) || !Number.isInteger(current.pid)) return null
    try { process.kill(current.pid, 0) } catch { return null }
    const running = await healthAt(current.port)
    return running?.url === current.url ? running : null
  } catch { return null }
}

async function main() {
  console.log(`语见${mode === 'dev' ? '开发环境' : ''}正在准备\n`)
  await clearStaleRuntime()
  const initialReport = await runChecks({ mode, quick: true, includePort: false })
  const logFile = await prepareLog().catch(() => undefined)
  const blocking = initialReport.results.find((item) => item.status === 'fail')
  if (blocking) {
    renderFailure(blocking, logFile)
    process.exitCode = 1
    return
  }

  log('[1/5] 检查运行环境')
  log(`      ✓ Node.js ${process.version}`)
  log('      ✓ Node 内置 SQLite 可用，无需安装数据库')

  if (mode === 'start') {
    const preferred = await configuredPort()
    const existing = await runningFromRuntime() || await healthAt(preferred)
    if (existing) {
      log('\n检测到语见已经在运行。')
      log(`访问地址：${existing.url}`)
      if (openBrowser(existing.url)) log('已打开浏览器。')
      return
    }
  }

  const firstInstall = !(initialReport.results.find((item) => item.id === 'dependencies')?.status === 'pass')
  log('\n[2/5] 准备项目组件')
  if (firstInstall) log('      首次运行需要下载必要组件，通常需要 1～3 分钟，请不要关闭窗口。')
  else log('      正在确认组件版本…')
  try {
    await runPnpm(['install', '--frozen-lockfile', '--reporter=append-only'], { errorCode: 'DEPENDENCY_DOWNLOAD_FAILED' })
  } catch (error) {
    renderInstallFailure(error, logFile)
    process.exitCode = 1
    return
  }
  log('      ✓ 项目组件准备完成')

  if (mode === 'dev') {
    log('\n[3/5] 准备开发服务端口')
    const apiPort = await findAvailablePort(await configuredPort())
    const webPort = await findAvailablePort(5173, new Set([apiPort]))
    const url = `http://127.0.0.1:${webPort}`
    log(`      ✓ 网页端口 ${webPort}，服务端口 ${apiPort}`)
    log('\n[4/5] 启动开发环境')
    const child = spawnPnpm(['run', 'internal:dev'], { env: { PORT: String(apiPort), LLC_API_PORT: String(apiPort), LLC_WEB_PORT: String(webPort), NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --disable-warning=ExperimentalWarning`.trim() } })
    await waitForWeb(url, child)
    log('\n[5/5] 开发环境已启动')
    log(`访问地址：${url}`)
    if (openBrowser(url)) log('浏览器已打开。')
    log('\n按 Ctrl+C 可以停止应用。')
    let requestedShutdown = false
    const forward = (signal) => { requestedShutdown = true; child.kill(signal) }
    process.once('SIGINT', () => forward('SIGINT'))
    process.once('SIGTERM', () => forward('SIGTERM'))
    const exited = await waitForExit(child)
    process.exitCode = requestedShutdown ? 0 : exited.code
    return
  }

  log('\n[3/5] 准备本地应用')
  try {
    await ensureBuild(forceBuild || mode === 'build')
  } catch (error) {
    console.error('\n应用构建失败。项目组件已经安装，但源代码未能成功构建。')
    console.error(`\n错误编号：${error.code || 'APPLICATION_BUILD_FAILED'}`)
    if (logFile) console.error(`诊断日志：${logFile}`)
    console.error('\n请运行 npm run doctor -- --verbose 获取完整检查结果。')
    process.exitCode = 1
    return
  }

  if (mode === 'build') {
    log('\n构建完成。')
    return
  }

  log('\n[4/5] 启动应用')
  const preferredPort = await configuredPort()
  const port = await findAvailablePort(preferredPort)
  if (port !== preferredPort) log(`      默认端口 ${preferredPort} 已被其他程序使用，将自动改用 ${port}。`)
  const url = `http://127.0.0.1:${port}`
  const child = spawnPnpm(['run', 'internal:serve'], { env: { NODE_ENV: 'production', PORT: String(port), LLC_RUNTIME_FILE: runtimePath, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --disable-warning=ExperimentalWarning`.trim() } })
  try {
    await waitForUrl(url, child)
  } catch (error) {
    child.kill('SIGTERM')
    console.error(`\n应用服务未能启动：${error.message}`)
    console.error(`错误编号：${error.code || 'APPLICATION_START_FAILED'}`)
    if (logFile) console.error(`诊断日志：${logFile}`)
    process.exitCode = 1
    return
  }
  log('      ✓ 应用已启动')
  log('\n[5/5] 打开应用')
  if (openBrowser(url)) log('      ✓ 浏览器已打开')
  else log('      • 未能自动打开浏览器，请手动打开下面的地址')
  log(`\n访问地址：${url}`)
  log('\n第一次使用时，网页会引导你配置模型和 API Key。')
  log('API Key 只保存在这台电脑上。')
  log('\n关闭此终端窗口或按 Ctrl+C 可以停止应用。')

  let requestedShutdown = false
  const stop = (signal) => { requestedShutdown = true; child.kill(signal) }
  process.once('SIGINT', () => stop('SIGINT'))
  process.once('SIGTERM', () => stop('SIGTERM'))
  const exited = await waitForExit(child)
  await clearRuntime(url)
  process.exitCode = requestedShutdown ? 0 : exited.code
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error)
  await appendFile(path.join(dataRoot, 'logs', 'bootstrap-unhandled.log'), `${new Date().toISOString()} ${redact(message)}\n`).catch(() => {})
  console.error(`\n语见无法启动：${message}`)
  console.error(`错误编号：${error?.code || 'BOOTSTRAP_INTERNAL_ERROR'}`)
  console.error('\n请运行 npm run doctor -- --verbose 获取完整检查结果。')
  process.exitCode = 1
}).finally(() => logStream?.end())
