import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, unlinkSync } from 'fs'
import { readConfig, writeConfig, updateConfig, deleteConfigKey, isInitialized, getConfigPath } from '../config.js'

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

  it('deep merges nested objects', () => {
    writeConfig({ onboarding: { step: 'server', server: { serverName: 'localhost', port: 6167 } } })
    updateConfig({ onboarding: { step: 'brain', server: { url: 'http://localhost:6167' } } })
    const config = readConfig()
    expect(config.onboarding.step).toBe('brain')
    expect(config.onboarding.server.serverName).toBe('localhost')
    expect(config.onboarding.server.port).toBe(6167)
    expect(config.onboarding.server.url).toBe('http://localhost:6167')
  })

  it('does not merge arrays — replaces them', () => {
    writeConfig({ data: { tags: ['a', 'b'] } })
    updateConfig({ data: { tags: ['c'] } })
    const config = readConfig()
    expect(config.data.tags).toEqual(['c'])
  })

  it('deleteConfigKey removes a top-level key', () => {
    writeConfig({ homeserver: { url: 'http://localhost:8008' }, onboarding: { step: 'brain' } })
    deleteConfigKey('onboarding')
    const config = readConfig()
    expect(config.homeserver.url).toBe('http://localhost:8008')
    expect(config.onboarding).toBeUndefined()
  })

  it('stamps _version on write', () => {
    writeConfig({ homeserver: { url: 'http://localhost:8008' } })
    const config = readConfig()
    expect(config._version).toBe(2)
  })

  it('migrates v1 flat onboarding keys to nested server', () => {
    // Write a v1-style config (no _version, flat onboarding keys)
    writeConfig({ _version: 1, onboarding: { step: 'server', serverName: 'example.com', port: 6167, registrationSecret: 'secret', homeserver: { url: 'http://localhost:6167', serverName: 'example.com' } } })
    const config = readConfig()
    expect(config._version).toBe(2)
    expect(config.onboarding.server.serverName).toBe('example.com')
    expect(config.onboarding.server.port).toBe(6167)
    expect(config.onboarding.server.registrationSecret).toBe('secret')
    expect(config.onboarding.server.url).toBe('http://localhost:6167')
    expect(config.onboarding.homeserver).toBeUndefined()
    expect(config.onboarding.serverName).toBeUndefined()
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
