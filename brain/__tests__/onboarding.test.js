import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, unlinkSync, readFileSync } from 'fs'
import request from 'supertest'
import yaml from 'js-yaml'
import { getConfigPath } from '../config.js'

// Mock homeserver.js before importing app
vi.mock('../homeserver.js', () => ({
  verifyHomeserver: vi.fn(),
  generateRegistrationKey: vi.fn(),
  registerBrain: vi.fn(),
  deriveBrainPassword: vi.fn(),
  runPreflightChecks: vi.fn(),
  findExistingBrainAdminRoom: vi.fn(),
  createBrainAdminRoom: vi.fn(),
  joinTuwunelAdminRoom: vi.fn()
}))

const {
  verifyHomeserver,
  generateRegistrationKey,
  registerBrain,
  runPreflightChecks,
  findExistingBrainAdminRoom,
  createBrainAdminRoom,
  joinTuwunelAdminRoom
} = await import('../homeserver.js')
const { default: app } = await import('../app.js')

afterEach(() => {
  const path = getConfigPath()
  if (existsSync(path)) unlinkSync(path)
  vi.restoreAllMocks()
})

describe('GET /api/status', () => {
  it('returns initialized false when no config', async () => {
    const res = await request(app).get('/api/status')
    expect(res.status).toBe(200)
    expect(res.body.initialized).toBe(false)
  })
})

describe('POST /api/onboarding/verify-homeserver', () => {
  it('returns 400 without url', async () => {
    const res = await request(app).post('/api/onboarding/verify-homeserver').send({})
    expect(res.status).toBe(400)
  })

  it('returns homeserver info on success', async () => {
    verifyHomeserver.mockResolvedValue({ url: 'http://localhost:8008', serverName: 'localhost', versions: ['v1.6'] })
    const res = await request(app).post('/api/onboarding/verify-homeserver').send({ url: 'http://localhost:8008' })
    expect(res.status).toBe(200)
    expect(res.body.versions).toContain('v1.6')
    expect(res.body.serverName).toBe('localhost')
  })

  it('returns 502 when unreachable', async () => {
    verifyHomeserver.mockRejectedValue(new Error('not reachable'))
    const res = await request(app).post('/api/onboarding/verify-homeserver').send({ url: 'http://bad:8008' })
    expect(res.status).toBe(502)
  })
})

describe('POST /api/onboarding/preflight', () => {
  it('returns 400 without url', async () => {
    const res = await request(app).post('/api/onboarding/preflight').send({})
    expect(res.status).toBe(400)
  })

  it('returns checks and allPassed', async () => {
    runPreflightChecks.mockResolvedValue([
      { id: 'reachable', status: 'pass' },
      { id: 'client_api', status: 'pass' }
    ])
    const res = await request(app).post('/api/onboarding/preflight').send({ url: 'http://localhost:8008' })
    expect(res.status).toBe(200)
    expect(res.body.allPassed).toBe(true)
    expect(res.body.checks).toHaveLength(2)
  })

  it('returns allPassed false when a check fails', async () => {
    runPreflightChecks.mockResolvedValue([
      { id: 'reachable', status: 'pass' },
      { id: 'registration', status: 'fail' }
    ])
    const res = await request(app).post('/api/onboarding/preflight').send({ url: 'http://localhost:8008' })
    expect(res.body.allPassed).toBe(false)
  })
})

describe('POST /api/onboarding/generate-key', () => {
  it('returns a generated key', async () => {
    generateRegistrationKey.mockReturnValue('test-key-123')
    const res = await request(app).post('/api/onboarding/generate-key')
    expect(res.status).toBe(200)
    expect(res.body.key).toBe('test-key-123')
  })
})

describe('POST /api/onboarding/init-brain', () => {
  it('returns 400 without url', async () => {
    const res = await request(app)
      .post('/api/onboarding/init-brain')
      .send({ name: 'My Brain', username: 'brain', registrationKey: 'key' })
    expect(res.status).toBe(400)
  })

  it('returns 400 without name', async () => {
    const res = await request(app)
      .post('/api/onboarding/init-brain')
      .send({ url: 'http://localhost:8008', username: 'brain', registrationKey: 'key' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/name/)
  })

  it('returns 400 without username', async () => {
    const res = await request(app)
      .post('/api/onboarding/init-brain')
      .send({ url: 'http://localhost:8008', name: 'My Brain', registrationKey: 'key' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/username/)
  })

  it('returns 400 without registrationKey', async () => {
    const res = await request(app)
      .post('/api/onboarding/init-brain')
      .send({ url: 'http://localhost:8008', name: 'My Brain', username: 'brain' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/registrationKey/)
  })

  it('initializes brain successfully', async () => {
    registerBrain.mockResolvedValue({
      user_id: '@brain:localhost',
      access_token: 'syt_abc'
    })
    findExistingBrainAdminRoom.mockResolvedValue(null)
    createBrainAdminRoom.mockResolvedValue('!admin:localhost')

    const res = await request(app).post('/api/onboarding/init-brain').send({
      url: 'http://localhost:8008',
      name: 'My Brain',
      username: 'brain',
      registrationKey: 'test-key'
    })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.brain.user_id).toBe('@brain:localhost')
    expect(res.body.brain.name).toBe('My Brain')
  })

  it('returns 502 when registration fails', async () => {
    registerBrain.mockRejectedValue(new Error('Registration failed'))

    const res = await request(app).post('/api/onboarding/init-brain').send({
      url: 'http://localhost:8008',
      name: 'My Brain',
      username: 'brain',
      registrationKey: 'bad-key'
    })

    expect(res.status).toBe(502)
  })

  it('joins Tuwunel admin room for local homeserver', async () => {
    registerBrain.mockResolvedValue({
      user_id: '@brain:localhost',
      access_token: 'syt_abc'
    })
    findExistingBrainAdminRoom.mockResolvedValue(null)
    createBrainAdminRoom.mockResolvedValue('!admin:localhost')
    joinTuwunelAdminRoom.mockResolvedValue('!tuwunel_admin:localhost')

    const res = await request(app).post('/api/onboarding/init-brain').send({
      url: 'http://localhost:8008',
      name: 'My Brain',
      username: 'brain',
      registrationKey: 'test-key',
      type: 'local'
    })

    expect(res.status).toBe(200)
    expect(joinTuwunelAdminRoom).toHaveBeenCalledWith('http://localhost:8008', 'syt_abc', 'localhost')
    const config = yaml.load(readFileSync(getConfigPath(), 'utf8'))
    expect(config.homeserver.tuwunel_admin_room_id).toBe('!tuwunel_admin:localhost')
  })

  it('does not join Tuwunel admin room for remote homeserver', async () => {
    registerBrain.mockResolvedValue({
      user_id: '@brain:localhost',
      access_token: 'syt_abc'
    })
    findExistingBrainAdminRoom.mockResolvedValue(null)
    createBrainAdminRoom.mockResolvedValue('!admin:localhost')

    const res = await request(app).post('/api/onboarding/init-brain').send({
      url: 'http://localhost:8008',
      name: 'My Brain',
      username: 'brain',
      registrationKey: 'test-key',
      type: 'remote'
    })

    expect(res.status).toBe(200)
    expect(joinTuwunelAdminRoom).not.toHaveBeenCalled()
    const config = yaml.load(readFileSync(getConfigPath(), 'utf8'))
    expect(config.homeserver.tuwunel_admin_room_id).toBeUndefined()
  })

  it('preserves onboarding state after init (for local networking step)', async () => {
    // Pre-populate onboarding state
    const { updateConfig } = await import('../config.js')
    updateConfig({ onboarding: { step: 'brain', path: 'local', server: { serverName: 'localhost', port: 6167 } } })

    registerBrain.mockResolvedValue({
      user_id: '@brain:localhost',
      access_token: 'syt_abc'
    })
    findExistingBrainAdminRoom.mockResolvedValue(null)
    createBrainAdminRoom.mockResolvedValue('!admin:localhost')

    await request(app).post('/api/onboarding/init-brain').send({
      url: 'http://localhost:8008',
      name: 'My Brain',
      username: 'brain',
      registrationKey: 'test-key'
    })

    const config = yaml.load(readFileSync(getConfigPath(), 'utf8'))
    // onboarding should still exist (removed only by /complete)
    expect(config.onboarding).toBeDefined()
    expect(config.onboarding.server.serverName).toBe('localhost')
    expect(config.brain.user_id).toBe('@brain:localhost')
    expect(config.brain.registrationKey).toBe('test-key')
  })
})

describe('POST /api/onboarding/reset', () => {
  it('deletes the config file', async () => {
    // Create some config first
    verifyHomeserver.mockResolvedValue({ url: 'http://localhost:8008', serverName: 'localhost', versions: ['v1.6'] })
    await request(app).post('/api/onboarding/verify-homeserver').send({ url: 'http://localhost:8008' })
    expect(existsSync(getConfigPath())).toBe(true)

    const res = await request(app).post('/api/onboarding/reset')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(existsSync(getConfigPath())).toBe(false)
  })
})

describe('POST /api/onboarding/save-identity', () => {
  it('saves identity to onboarding config', async () => {
    const res = await request(app)
      .post('/api/onboarding/save-identity')
      .send({ name: 'My Brain', username: 'brain', registrationKey: 'key-123' })
    expect(res.status).toBe(200)

    const config = yaml.load(readFileSync(getConfigPath(), 'utf8'))
    expect(config.onboarding.step).toBe('brain')
    expect(config.onboarding.identity.name).toBe('My Brain')
    expect(config.onboarding.identity.registrationKey).toBe('key-123')
  })
})

describe('onboarding state persistence', () => {
  it('verify-homeserver saves only essential config', async () => {
    verifyHomeserver.mockResolvedValue({
      url: 'http://localhost:8008',
      serverName: 'localhost',
      versions: ['v1.6'],
      unstableFeatures: ['org.matrix.msc1234'],
      server: { name: 'Synapse', version: '1.98.0' }
    })
    await request(app).post('/api/onboarding/verify-homeserver').send({ url: 'http://localhost:8008' })

    const config = yaml.load(readFileSync(getConfigPath(), 'utf8'))
    expect(config.onboarding.step).toBe('server')
    expect(config.onboarding.path).toBe('remote')
    expect(config.onboarding.server.url).toBe('http://localhost:8008')
    expect(config.onboarding.server.serverName).toBe('localhost')
    // Read-only data should NOT be saved
    expect(config.onboarding.server.versions).toBeUndefined()
    expect(config.onboarding.server.unstableFeatures).toBeUndefined()
  })

  it('status returns onboarding config for resume', async () => {
    verifyHomeserver.mockResolvedValue({ url: 'http://localhost:8008', serverName: 'localhost', versions: ['v1.6'] })
    await request(app).post('/api/onboarding/verify-homeserver').send({ url: 'http://localhost:8008' })

    const res = await request(app).get('/api/status')
    expect(res.body.initialized).toBe(false)
    expect(res.body.config.onboarding.step).toBe('server')
  })
})

describe('POST /api/onboarding/complete', () => {
  it('returns 400 when no config exists', async () => {
    const res = await request(app).post('/api/onboarding/complete')
    expect(res.status).toBe(400)
  })

  it('removes onboarding key and moves networking to homeserver', async () => {
    const { writeConfig } = await import('../config.js')
    writeConfig({
      homeserver: { url: 'http://localhost:8008', serverName: 'localhost', type: 'local' },
      brain: { user_id: '@brain:localhost', access_token: 'syt_abc', registrationKey: 'test-key' },
      onboarding: {
        step: 'ready',
        path: 'local',
        networking: { networkMode: 'tunnel', domain: 'brain.example.com', tunnelToken: 'tok_123' }
      }
    })

    const res = await request(app).post('/api/onboarding/complete')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.config.onboarding).toBeUndefined()
    expect(res.body.config.homeserver.networkMode).toBe('tunnel')
    expect(res.body.config.homeserver.domain).toBe('brain.example.com')
    expect(res.body.config.homeserver.tunnelToken).toBe('tok_123')
    expect(res.body.config.brain.registrationKey).toBe('test-key')
  })

  it('works without networking data (remote path)', async () => {
    const { writeConfig } = await import('../config.js')
    writeConfig({
      homeserver: { url: 'http://remote:8008', serverName: 'remote', type: 'remote' },
      brain: { user_id: '@brain:remote', access_token: 'syt_xyz' },
      onboarding: { step: 'ready', path: 'remote' }
    })

    const res = await request(app).post('/api/onboarding/complete')
    expect(res.status).toBe(200)
    expect(res.body.config.onboarding).toBeUndefined()
    expect(res.body.config.homeserver.networkMode).toBeUndefined()
  })
})
