import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const tauriConfigPath = path.join(root, 'apps/web/src-tauri/tauri.conf.json')
const cargoTomlPath = path.join(root, 'apps/web/src-tauri/Cargo.toml')
const cargoLockPath = path.join(root, 'apps/web/src-tauri/Cargo.lock')

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function write(file, content) {
  fs.writeFileSync(file, content)
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match)
    throw new Error(`Unsupported version format: ${version}`)
  return match.slice(1).map(Number)
}

function nextVersion(current, bump) {
  if (/^\d+\.\d+\.\d+$/.test(bump))
    return bump

  const [major, minor, patch] = parseVersion(current)
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      throw new Error(`Usage: node scripts/bump-desktop-version.mjs [patch|minor|major|x.y.z]`)
  }
}

function updateCargoLock(content, version) {
  return content.replace(
    /(\[\[package\]\]\nname = "mdlook"\nversion = ")([^"]+)(")/,
    `$1${version}$3`,
  )
}

const bump = process.argv[2] ?? 'patch'
const tauriConfig = JSON.parse(read(tauriConfigPath))
const current = tauriConfig.version
const version = nextVersion(current, bump)

tauriConfig.version = version
write(`${tauriConfigPath}`, `${JSON.stringify(tauriConfig, null, 2)}\n`)

write(
  cargoTomlPath,
  read(cargoTomlPath).replace(/^version = "([^"]+)"/m, `version = "${version}"`),
)

if (fs.existsSync(cargoLockPath))
  write(cargoLockPath, updateCargoLock(read(cargoLockPath), version))

console.log(`mdlook desktop version: ${current} -> ${version}`)
