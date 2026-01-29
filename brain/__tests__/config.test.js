import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, unlinkSync } from 'fs'
import { readConfig, writeConfig, updateConfig, isInitialized, getConfigPath } from '../config.js'

function cleanConfig() {
  const path = getConfigPath()
  if (existsSync(path)) unlinkSync(path)
}

beforeEach(cleanConfig)
afterEach(cleanConfig)

describe('config', () => {
  it('returns null when no config file exists', () => {
    expect(readConfig()).toBeNull()
  })

  it('writes and reads config', () => {
    writeConfig({ homeserver: { url: 'http://localhost:8008' } })
    const config = readConfig()
    expect(config.homeserver.url).toBe('http://localhost:8008')
  })

  it('merges partial updates', () => {
    writeConfig({ homeserver: { url: 'http://localhost:8008' } })
    updateConfig({ brain: { user_id: '@nervur-brain:localhost' } })
    const config = readConfig()
    expect(config.homeserver.url).toBe('http://localhost:8008')
    expect(config.brain.user_id).toBe('@nervur-brain:localhost')
  })

  it('reports not initialized without config', () => {
    expect(isInitialized()).toBe(false)
  })

  it('reports not initialized with partial config', () => {
    writeConfig({ homeserver: { url: 'http://localhost:8008' } })
    expect(isInitialized()).toBe(false)
  })

  it('reports initialized with full config', () => {
    writeConfig({
      homeserver: { url: 'http://localhost:8008' },
      brain: { access_token: 'syt_test' }
    })
    expect(isInitialized()).toBe(true)
  })
})
