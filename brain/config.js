import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = process.env.NERVUR_TEST
  ? join(dirname(fileURLToPath(import.meta.url)), '..', `.config-test-${process.pid}.yml`)
  : join(__dirname, '..', 'config.yml')

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
