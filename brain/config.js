import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Data directory: env var > cwd (dev: matrix-brain/, prod: /app)
// Tests use per-process temp files inside the source tree
const DATA_DIR = process.env.NERVUR_TEST
  ? __dirname // tests write next to source, cleaned up after
  : (process.env.DATA_DIR || join(process.cwd(), 'data'))

// Ensure data dir exists (no-op if already there)
if (!process.env.NERVUR_TEST) {
  try { mkdirSync(DATA_DIR, { recursive: true }) } catch {}
}

const CONFIG_PATH = process.env.NERVUR_TEST
  ? join(__dirname, `.config-test-${process.pid}.yml`)
  : join(DATA_DIR, 'config.yml')

export function getConfigPath() {
  return CONFIG_PATH
}

export function readConfig() {
  if (!existsSync(CONFIG_PATH)) return null
  return yaml.load(readFileSync(CONFIG_PATH, 'utf8'))
}

export function writeConfig(config) {
  writeFileSync(CONFIG_PATH, yaml.dump(config, { lineWidth: 120 }), 'utf8')
}

export function updateConfig(partial) {
  const current = readConfig() || {}
  const merged = { ...current, ...partial }
  writeConfig(merged)
  return merged
}

export function deleteConfig() {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH)
}

export function isInitialized() {
  const config = readConfig()
  return !!(config?.homeserver?.url && config?.brain?.access_token)
}
