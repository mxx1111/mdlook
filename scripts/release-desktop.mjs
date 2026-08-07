import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const webDir = path.join(root, 'apps/web')
const tauriDir = path.join(webDir, 'src-tauri')
const tauriConfigPath = path.join(tauriDir, 'tauri.conf.json')
const cargoTomlPath = path.join(tauriDir, 'Cargo.toml')
const cargoLockPath = path.join(tauriDir, 'Cargo.lock')
const latestPath = path.join(webDir, 'public/download/latest.json')
const bumpScriptPath = path.join(root, 'scripts/bump-desktop-version.mjs')
const releaseDir = path.join(root, 'dist-release')

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    ...options,
  })
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function sha256(file) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(file))
  return hash.digest('hex')
}

function releaseDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function architecture() {
  if (process.arch === 'arm64')
    return { artifact: 'aarch64', description: '适用于 M1、M2、M3、M4 及后续 M 系列 Mac' }
  if (process.arch === 'x64')
    return { artifact: 'x64', description: '适用于 Intel 芯片 Mac' }
  throw new Error(`Unsupported desktop release architecture: ${process.arch}`)
}

function appVersion(appPath) {
  if (process.platform !== 'darwin')
    throw new Error('Desktop release verification currently requires macOS')
  return run('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleShortVersionString',
    path.join(appPath, 'Contents/Info.plist'),
  ], { capture: true }).trim()
}

function usage() {
  console.log(`Usage: pnpm desktop:release [patch|minor|major|x.y.z]

Builds and verifies the macOS app and DMG, then writes:
  dist-release/mdlook_<version>_<arch>.dmg
  dist-release/latest.json
  apps/web/public/download/latest.json`)
}

const requested = process.argv[2] ?? 'patch'
if (requested === '-h' || requested === '--help') {
  usage()
  process.exit(0)
}

const allowed = /^(patch|minor|major|\d+\.\d+\.\d+)$/
if (!allowed.test(requested)) {
  usage()
  process.exit(1)
}

const status = run('git', ['status', '--porcelain'], { capture: true }).trim()
if (status)
  throw new Error('Desktop release requires a clean Git worktree. Commit or stash changes first.')

const rollbackPaths = [tauriConfigPath, cargoTomlPath, cargoLockPath, latestPath]
const originals = new Map(rollbackPaths.map(file => [file, fs.readFileSync(file)]))
let completed = false

try {
  run(process.execPath, [bumpScriptPath, requested])

  const version = readJson(tauriConfigPath).version
  const sourceCommit = run('git', ['rev-parse', '--short=12', 'HEAD'], { capture: true }).trim()
  const arch = architecture()

  console.log(`Building mdlook desktop ${version} from ${sourceCommit}...`)
  run('pnpm', ['--filter', '@md/web', 'tauri', 'build'])

  const appPath = path.join(tauriDir, 'target/release/bundle/macos/mdlook.app')
  const dmgName = `mdlook_${version}_${arch.artifact}.dmg`
  const builtDmgPath = path.join(tauriDir, 'target/release/bundle/dmg', dmgName)

  if (!fs.existsSync(appPath))
    throw new Error(`App bundle not found: ${appPath}`)
  if (!fs.existsSync(builtDmgPath))
    throw new Error(`DMG not found: ${builtDmgPath}`)

  const bundledVersion = appVersion(appPath)
  if (bundledVersion !== version)
    throw new Error(`App version mismatch: config=${version}, bundle=${bundledVersion}`)

  run('codesign', ['--verify', '--deep', '--strict', appPath])
  run('hdiutil', ['verify', builtDmgPath])

  const stat = fs.statSync(builtDmgPath)
  const digest = sha256(builtDmgPath)
  const manifest = {
    schemaVersion: 1,
    version,
    releasedAt: releaseDate(),
    sourceCommit,
    files: [
      {
        label: process.arch === 'arm64' ? 'macOS Apple 芯片版' : 'macOS Intel 芯片版',
        description: arch.description,
        size: `${(stat.size / 1024 / 1024).toFixed(1)} MB`,
        sizeBytes: stat.size,
        url: `/downloads/${dmgName}`,
        sha256: digest,
        recommended: process.arch === 'arm64',
      },
    ],
  }

  fs.mkdirSync(releaseDir, { recursive: true })
  const releaseDmgPath = path.join(releaseDir, dmgName)
  fs.copyFileSync(builtDmgPath, releaseDmgPath)
  writeJson(latestPath, manifest)
  writeJson(path.join(releaseDir, 'latest.json'), manifest)

  console.log('\nDesktop release prepared and verified:')
  console.log(`  version:  ${version}`)
  console.log(`  app:      ${appPath}`)
  console.log(`  dmg:      ${releaseDmgPath}`)
  console.log(`  bytes:    ${stat.size}`)
  console.log(`  sha256:   ${digest}`)
  console.log(`  manifest: ${path.join(releaseDir, 'latest.json')}`)
  completed = true
}
finally {
  if (!completed) {
    for (const [file, content] of originals)
      fs.writeFileSync(file, content)
    console.error('Desktop release failed; tracked version and manifest files were restored.')
  }
}
