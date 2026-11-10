import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { chmod, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { dataRoot } from '../server/services/config.js'

const executeFile = promisify(execFile)
const releaseApi = 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest'

interface ReleaseAsset { name: string; browser_download_url: string; digest?: string }
interface Release { tag_name: string; assets: ReleaseAsset[] }

export function cloudflaredAsset(platform = process.platform, architecture = process.arch) {
  if (platform === 'darwin' && architecture === 'arm64') return 'cloudflared-darwin-arm64.tgz'
  if (platform === 'darwin' && architecture === 'x64') return 'cloudflared-darwin-amd64.tgz'
  if (platform === 'linux' && architecture === 'x64') return 'cloudflared-linux-amd64'
  if (platform === 'linux' && architecture === 'arm64') return 'cloudflared-linux-arm64'
  if (platform === 'linux' && architecture === 'arm') return 'cloudflared-linux-arm'
  if (platform === 'win32' && architecture === 'x64') return 'cloudflared-windows-amd64.exe'
  if (platform === 'win32' && architecture === 'ia32') return 'cloudflared-windows-386.exe'
  throw new Error(`Unsupported platform for automatic remote access: ${platform}/${architecture}`)
}

async function executableWorks(binary: string) {
  try {
    const { stdout } = await executeFile(binary, ['--version'], { timeout: 10_000 })
    const version = stdout.match(/\b(\d{4})\.(\d+)\.(\d+)\b/)
    if (!version) return false
    const numeric = Number(version[1]) * 1_000_000 + Number(version[2]) * 1_000 + Number(version[3])
    return numeric >= 2_026_009_002
  }
  catch { return false }
}

export async function ensureCloudflared(progress: (message: string) => void = () => {}) {
  const binDirectory = path.join(dataRoot, 'bin')
  const binary = path.join(binDirectory, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared')
  await mkdir(binDirectory, { recursive: true, mode: 0o700 })
  if (await executableWorks(binary)) return binary

  progress('Downloading the verified Cloudflare tunnel helper…')
  const releaseResponse = await fetch(releaseApi, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'local-language-coach' }, signal: AbortSignal.timeout(30_000) })
  if (!releaseResponse.ok) throw new Error(`Could not read Cloudflare release metadata (${releaseResponse.status})`)
  const release = await releaseResponse.json() as Release
  const assetName = cloudflaredAsset()
  const asset = release.assets.find((item) => item.name === assetName)
  if (!asset?.digest?.startsWith('sha256:')) throw new Error(`No verified ${assetName} asset was found in the latest Cloudflare release`)

  const download = await fetch(asset.browser_download_url, { headers: { 'user-agent': 'local-language-coach' }, redirect: 'follow', signal: AbortSignal.timeout(120_000) })
  if (!download.ok) throw new Error(`Could not download Cloudflare tunnel helper (${download.status})`)
  const bytes = Buffer.from(await download.arrayBuffer())
  const actualDigest = createHash('sha256').update(bytes).digest('hex')
  const expectedDigest = asset.digest.slice('sha256:'.length)
  if (actualDigest !== expectedDigest) throw new Error('Cloudflare tunnel helper checksum verification failed')

  const downloaded = path.join(binDirectory, `${assetName}.${process.pid}.download`)
  await writeFile(downloaded, bytes, { mode: 0o600 })
  try {
    if (assetName.endsWith('.tgz')) await executeFile('tar', ['-xzf', downloaded, '-C', binDirectory], { timeout: 60_000 })
    else await rename(downloaded, binary)
  } finally {
    await unlink(downloaded).catch(() => {})
  }
  if (process.platform !== 'win32') await chmod(binary, 0o755)
  if (!await executableWorks(binary)) throw new Error('Downloaded Cloudflare tunnel helper could not be executed')
  await writeFile(path.join(binDirectory, 'cloudflared.meta.json'), `${JSON.stringify({ version: release.tag_name, asset: assetName, digest: asset.digest, downloadedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 })
  progress(`Cloudflare tunnel helper ${release.tag_name} is ready.`)
  return binary
}

export async function cloudflaredVersion(binary: string) {
  const { stdout } = await executeFile(binary, ['--version'], { timeout: 10_000 })
  return stdout.trim()
}
