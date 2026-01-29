import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Data directory: env var > cwd (dev: matrix-brain/, prod: /app)
// Tests use per-process temp files inside the source tree
const DATA_DIR = process.env.NERVUR_TEST
  ? __dirname // tests write next to source, cleaned up after
  : process.env.DATA_DIR || join(process.cwd(), 'data')

// Ensure data dir exists (no-op if already there)
if (!process.env.NERVUR_TEST) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
  } catch {
    /* ignore */
  }
}

const CONFIG_PATH = process.env.NERVUR_TEST
  ? join(__dirname, `.config-test-${process.pid}.yml`)
  : join(DATA_DIR, 'config.yml')

const CURRENT_VERSION = 2

export function getConfigPath() {
  return CONFIG_PATH
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key])
    } else {
      target[key] = source[key]
    }
  }
  return target
}

// Migrate v1 (flat onboarding keys) to v2 (nested onboarding.server/identity/networking)
function migrateConfig(config) {
  if (!config || config._version >= CURRENT_VERSION) return config

  const ob = config.onboarding
  if (ob && !ob.server) {
    // v1 → v2: move flat keys into nested structure
    const server = {}
    if (ob.serverName) {
      server.serverName = ob.serverName
      delete ob.serverName
    }
    if (ob.port) {
      server.port = ob.port
      delete ob.port
    }
    if (ob.registrationSecret) {
      server.registrationSecret = ob.registrationSecret
      delete ob.registrationSecret
    }
    if (ob.input) {
      server.input = ob.input
      delete ob.input
    }
    if (ob.homeserver) {
      if (ob.homeserver.url) server.url = ob.homeserver.url
      if (ob.homeserver.serverName) server.serverName = ob.homeserver.serverName
      delete ob.homeserver
    }
    if (Object.keys(server).length) ob.server = server
  }

  config._version = CURRENT_VERSION
  return config
}

export function readConfig() {
  if (!existsSync(CONFIG_PATH)) return null
  const config = yaml.load(readFileSync(CONFIG_PATH, 'utf8'))
  return migrateConfig(config)
}

export function writeConfig(config) {
  if (config && !config._version) config._version = CURRENT_VERSION
  writeFileSync(CONFIG_PATH, yaml.dump(config, { lineWidth: 120 }), 'utf8')
}

export function updateConfig(partial) {
  const current = readConfig() || {}
  const merged = deepMerge(current, partial)
  writeConfig(merged)
  return merged
}

export function deleteConfigKey(key) {
  const config = readConfig()
  if (!config) return null
  delete config[key]
  writeConfig(config)
  return config
}

export function deleteConfig() {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH)
}

export function isInitialized() {
  const config = readConfig()
  return !!(config?.homeserver?.url && config?.brain?.access_token)
}
