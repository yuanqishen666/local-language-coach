import { spawnSync } from 'node:child_process'
import { access, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
export const projectRoot = path.resolve(scriptDirectory, '..', '..')
export const dataRoot = path.resolve(process.env.LLC_DATA_DIR || path.join(projectRoot, 'data'))
export const configPath = path.join(dataRoot, 'config.json')
export const secretsPath = path.join(dataRoot, 'secrets.json')
export const databasePath = path.join(dataRoot, 'app.db')
export const runtimePath = path.join(dataRoot, 'runtime.json')

export const packageManifest = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))

function result(id, status, title, options = {}) {
  return { id, status, title, ...options }
}

function versionParts(value) {
  return String(value).replace(/^v/, '').split(/[.-]/).slice(0, 3).map((part) => Number(part) || 0)
}

export function versionAtLeast(actual, required) {
  const left = versionParts(actual)
  const right = versionParts(required)
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true
    if (left[index] < right[index]) return false
  }
  return true
}

function requiredNodeVersion() {
  return packageManifest.engines?.node?.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1] || '22.13.0'
}

function executable(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name
}

function commandVersion(name) {
  const npmExecPath = name === 'npm' ? process.env.npm_execpath : undefined
  const command = npmExecPath ? process.execPath : process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : executable(name)
  const argumentsList = npmExecPath
    ? [npmExecPath, '--version']
    : process.platform === 'win32'
      ? ['/d', '/s', '/c', name, '--version']
      : ['--version']
  const checked = spawnSync(command, argumentsList, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  })
  if (checked.error || checked.status !== 0) return null
  return String(checked.stdout || checked.stderr).trim().split(/\s+/)[0] || null
}

function sqliteProbe(existingDatabase) {
  const source = existingDatabase
    ? `import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync(process.argv[1], { readOnly: true }); const row = db.prepare('PRAGMA quick_check').get(); db.close(); if (row.quick_check !== 'ok') throw new Error(String(row.quick_check)); console.log('ok')`
    : `import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync(':memory:'); db.exec("CREATE TABLE doctor(value TEXT); INSERT INTO doctor VALUES ('ok')"); const row = db.prepare('SELECT value FROM doctor').get(); db.close(); if (row.value !== 'ok') throw new Error('SQLite read/write probe failed'); console.log('ok')`
  const checked = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', source, ...(existingDatabase ? [databasePath] : [])], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  })
  return checked.status === 0 ? { ok: true } : { ok: false, detail: String(checked.stderr || checked.stdout || checked.error?.message || '').trim() }
}

async function pathExists(target) {
  try { await access(target); return true } catch { return false }
}

async function readJson(target) {
  try {
    const source = await readFile(target, 'utf8')
    return { exists: true, value: JSON.parse(source) }
  } catch (error) {
    if (error instanceof Error && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return { exists: false }
    return { exists: true, error: error instanceof Error ? error.message : String(error) }
  }
}

export function isConfigShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (value.providers !== undefined && (!Array.isArray(value.providers) || value.providers.some((provider) => !provider || typeof provider !== 'object' || typeof provider.id !== 'string'))) return false
  for (const section of ['ui', 'learning', 'llm', 'server']) {
    if (value[section] !== undefined && (!value[section] || typeof value[section] !== 'object' || Array.isArray(value[section]))) return false
  }
  return true
}

async function dataDirectoryCheck() {
  try {
    await mkdir(dataRoot, { recursive: true, mode: 0o700 })
    const probe = path.join(dataRoot, `.write-probe-${process.pid}-${Date.now()}`)
    await writeFile(probe, 'ok', { mode: 0o600 })
    await unlink(probe)
    return { ok: true }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

export async function healthAt(port) {
  const url = `http://127.0.0.1:${port}`
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1_200) })
    if (!response.ok) return null
    const body = await response.json()
    return body?.app === 'local-language-coach' && body?.ok ? { url, body } : null
  } catch { return null }
}

export function portIsAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen({ host: '127.0.0.1', port }, () => server.close(() => resolve(true)))
  })
}

export async function findAvailablePort(preferred, excluded = new Set()) {
  for (let port = preferred; port <= preferred + 30; port += 1) {
    if (!excluded.has(port) && await portIsAvailable(port)) return port
  }
  throw Object.assign(new Error(`No available local port was found near ${preferred}`), { code: 'LOCAL_PORT_UNAVAILABLE' })
}

export async function configuredPort() {
  const config = await readJson(configPath)
  const value = Number(config.value?.server?.port)
  return Number.isInteger(value) && value > 0 && value < 65_536 ? value : 4174
}

async function checkPort(port, mode) {
  const running = await healthAt(port)
  if (running) return result('port', 'pass', `语见已经在端口 ${port} 运行`, { detail: running.url })
  if (await portIsAvailable(port)) return result('port', 'pass', `本地端口 ${port} 可用`)
  return result(
    'port',
    mode === 'start' || mode === 'dev' ? 'warn' : 'warn',
    `默认端口 ${port} 正在被其他程序使用`,
    { detail: '启动器会自动选择另一个可用端口，不会结束其他程序。', code: 'LOCAL_PORT_IN_USE' },
  )
}

function providerCheck(config, secrets) {
  if (!config || config.setupComplete !== true) {
    return result('provider', 'info', '首次使用时会在网页中连接对话模型', {
      detail: '这不会阻止应用启动。API Key 只保存在本机。',
    })
  }
  const provider = config.providers?.find((item) => item.id === config.llm?.defaultProvider)
  if (!provider) return result('provider', 'warn', '默认模型配置不存在', { fix: '启动应用后前往“设置 → 模型与密钥”重新选择模型。' })
  const hasKey = !provider.apiKeySecret || Boolean(secrets?.[provider.apiKeySecret])
  const capabilityReady = Boolean(
    provider.capability &&
    provider.capability.model === provider.model &&
    String(provider.capability.baseUrl || '').replace(/\/$/, '') === String(provider.baseUrl || '').replace(/\/$/, ''),
  )
  const enabled = provider.apiKeySecret ? hasKey : provider.enabled
  if (provider.baseUrl && provider.model && enabled && capabilityReady) return result('provider', 'pass', `默认模型 ${provider.name || provider.id} 已配置`)
  return result('provider', 'warn', `默认模型 ${provider.name || provider.id} 尚未完成配置`, {
    detail: '这不会阻止应用启动，也不会在诊断时发起可能收费的模型请求。',
    fix: '启动应用后前往“设置 → 模型与密钥”完成测试并保存。',
  })
}

export async function runChecks(options = {}) {
  const mode = options.mode || 'doctor'
  const quick = Boolean(options.quick)
  const includePort = options.includePort !== false
  const results = []
  const requiredNode = requiredNodeVersion()

  if (versionAtLeast(process.version, requiredNode)) {
    results.push(result('node', 'pass', `Node.js ${process.version}`, { detail: `要求 >=${requiredNode}` }))
  } else {
    results.push(result('node', 'fail', `Node.js 版本太旧：${process.version}`, {
      detail: `语见需要 Node.js >=${requiredNode}。项目使用 Node 内置 SQLite，不需要单独安装 SQLite。`,
      fix: '从 https://nodejs.org/ 安装当前 LTS 版本，重新打开终端后再运行 npm start。',
      code: 'ENV_NODE_VERSION',
    }))
  }

  const npmVersion = commandVersion('npm')
  results.push(npmVersion
    ? result('npm', 'pass', `npm ${npmVersion}`)
    : result('npm', 'fail', '没有找到 npm', {
      detail: '标准 Node.js 安装通常会同时安装 npm。',
      fix: '从 https://nodejs.org/ 重新安装当前 LTS 版本。',
      code: 'ENV_NPM_MISSING',
    }))

  const sqlite = sqliteProbe(false)
  results.push(sqlite.ok
    ? result('sqlite', 'pass', 'Node 内置 SQLite 可用', { detail: '无需安装 sqlite3 或数据库服务。' })
    : result('sqlite', 'fail', 'Node 内置 SQLite 不可用', {
      detail: sqlite.detail,
      fix: `重新安装 Node.js >=${requiredNode}；不要单独安装 sqlite3。`,
      code: 'ENV_SQLITE_UNAVAILABLE',
    }))

  const writable = await dataDirectoryCheck()
  results.push(writable.ok
    ? result('data', 'pass', '本地数据目录可写', { detail: dataRoot })
    : result('data', 'fail', '本地数据目录不可写', {
      detail: `${dataRoot}\n${writable.detail || ''}`.trim(),
      fix: '将项目移动到当前用户可写的目录后重新运行 npm start。不会自动使用 sudo 或批量修改权限。',
      code: 'DATA_DIRECTORY_NOT_WRITABLE',
    }))

  const config = await readJson(configPath)
  if (config.error || (config.exists && !isConfigShape(config.value))) {
    results.push(result('config', 'fail', '本地设置文件无法读取', {
      detail: `${configPath}\n${config.error || '设置文件不是有效的语见配置结构。'}`,
      fix: '运行 npm run doctor -- --repair-config。原文件会先被保留为备份。',
      code: 'LOCAL_CONFIG_INVALID',
    }))
  } else {
    results.push(result('config', 'pass', config.exists ? '本地设置文件正常' : '尚未创建本地设置', {
      detail: config.exists ? configPath : '首次启动时会自动创建。',
    }))
  }

  const secrets = await readJson(secretsPath)
  if (secrets.error || (secrets.exists && (!secrets.value || typeof secrets.value !== 'object' || Array.isArray(secrets.value) || Object.values(secrets.value).some((secret) => typeof secret !== 'string')))) {
    results.push(result('secrets', 'fail', '本地密钥文件无法读取', {
      detail: secretsPath,
      fix: '不要删除原文件。请保留诊断日志并在项目 Issue 中寻求帮助。',
      code: 'LOCAL_SECRETS_INVALID',
    }))
  } else if (secrets.exists && process.platform !== 'win32') {
    const permissions = (await stat(secretsPath)).mode & 0o777
    results.push(permissions & 0o077
      ? result('secrets', 'warn', '本地密钥文件权限过宽', {
        detail: `${secretsPath} 当前权限为 ${permissions.toString(8)}。`,
        fix: `运行 chmod 600 "${secretsPath}"。`,
      })
      : result('secrets', 'pass', '本地密钥文件权限正常'))
  } else {
    results.push(result('secrets', 'pass', secrets.exists ? '本地密钥文件正常' : '尚未保存 API Key'))
  }

  const dependencyFiles = [
    path.join(projectRoot, 'node_modules', '.modules.yaml'),
    path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.CMD' : 'tsx'),
    path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.CMD' : 'vite'),
  ]
  const dependenciesReady = (await Promise.all(dependencyFiles.map(pathExists))).every(Boolean)
  results.push(dependenciesReady
    ? result('dependencies', 'pass', '项目组件已安装')
    : result('dependencies', 'warn', '项目组件尚未安装', {
      detail: '这属于首次运行的正常情况。',
      fix: '直接运行 npm start，启动器会自动安装锁定版本的组件。',
    }))

  if (!quick && await pathExists(databasePath)) {
    const database = sqliteProbe(true)
    results.push(database.ok
      ? result('database', 'pass', '本地数据库完整性检查通过')
      : result('database', 'fail', '本地数据库完整性检查失败', {
        detail: database.detail,
        fix: '不要删除 data/app.db。请先备份 data/ 目录，再携带诊断日志寻求帮助。',
        code: 'LOCAL_DATABASE_INVALID',
      }))
  }

  const buildReady = await pathExists(path.join(projectRoot, 'dist', 'web', 'index.html')) && await pathExists(path.join(projectRoot, 'dist', 'server', 'server', 'index.js'))
  results.push(buildReady
    ? result('build', 'pass', '应用构建产物可用')
    : result('build', 'info', '应用尚未构建', { detail: 'npm start 会自动构建，不需要手动处理。' }))

  if (!quick) results.push(providerCheck(config.error || !isConfigShape(config.value) ? null : config.value, secrets.error ? null : secrets.value))

  const port = await configuredPort()
  if (includePort) {
    results.push(await checkPort(port, mode))
    if (mode === 'dev') results.push(await checkPort(5173, mode))
  }

  return {
    version: 1,
    ok: !results.some((item) => item.status === 'fail'),
    checkedAt: new Date().toISOString(),
    context: {
      projectRoot,
      dataRoot,
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      packageManager: packageManifest.packageManager,
      mode,
    },
    results,
  }
}
