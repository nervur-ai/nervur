import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, unlinkSync } from 'fs'
import request from 'supertest'
import express from 'express'
import { getConfigPath } from '../../brain/config.js'

// Mock provision.js
vi.mock('../provision.js', () => ({
  runPreflight: vi.fn(),
  configure: vi.fn(),
  pull: vi.fn(),
  start: vi.fn(),
  verify: vi.fn(),
  getStatus: vi.fn()
}))

const provision = await import('../provision.js')
const { default: localRoutes } = await import('../routes.js')

// Build a minimal Express app with the routes
const app = express()
app.use(express.json())
app.use('/api/onboarding/local', localRoutes)

afterEach(() => {
  const path = getConfigPath()
  if (existsSync(path)) unlinkSync(path)
  vi.restoreAllMocks()
})

describe('POST /api/onboarding/local/preflight', () => {
  it('returns preflight results', async () => {
    provision.runPreflight.mockResolvedValue({
      success: true,
      results: [
        { id: 'docker', label: 'Docker available', status: 'pass', message: 'Docker 24.0' },
        { id: 'ports', label: 'Port available', status: 'pass', message: 'Port 8008 is free' }
      ]
    })

    const res = await request(app).post('/api/onboarding/local/preflight')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.results).toHaveLength(2)
  })

  it('returns 500 on error', async () => {
    provision.runPreflight.mockRejectedValue(new Error('unexpected'))
    const res = await request(app).post('/api/onboarding/local/preflight')
    expect(res.status).toBe(500)
  })
})

describe('POST /api/onboarding/local/configure', () => {
  it('configures and saves to YAML', async () => {
    provision.configure.mockResolvedValue({
      success: true,
      registrationSecret: 'secret123',
      containerName: 'nervur-homeserver',
      serverName: 'test.local',
      port: 8008
    })

    const res = await request(app).post('/api/onboarding/local/configure').send({ serverName: 'test.local' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.registrationSecret).toBe('secret123')
  })
})

describe('POST /api/onboarding/local/pull', () => {
  it('returns success on pull', async () => {
    provision.pull.mockResolvedValue({ success: true, output: 'Pulled' })
    const res = await request(app).post('/api/onboarding/local/pull')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 500 on pull failure', async () => {
    provision.pull.mockRejectedValue(new Error('pull failed'))
    const res = await request(app).post('/api/onboarding/local/pull')
    expect(res.status).toBe(500)
  })
})

describe('POST /api/onboarding/local/start', () => {
  it('returns success when healthy', async () => {
    provision.start.mockResolvedValue({ success: true, url: 'http://localhost:8008', elapsed: 5000 })
    const res = await request(app).post('/api/onboarding/local/start')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.url).toBe('http://localhost:8008')
  })

  it('returns 502 when not healthy', async () => {
    provision.start.mockResolvedValue({ success: false, error: 'timeout' })
    const res = await request(app).post('/api/onboarding/local/start')
    expect(res.status).toBe(502)
  })
})

describe('POST /api/onboarding/local/verify', () => {
  it('returns verification result', async () => {
    provision.verify.mockResolvedValue({ success: true, url: 'http://localhost:8008', versions: ['v1.6'] })
    const res = await request(app).post('/api/onboarding/local/verify')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

describe('GET /api/onboarding/local/status', () => {
  it('returns status info', async () => {
    provision.getStatus.mockResolvedValue({ configured: true, running: true, healthy: true })
    const res = await request(app).get('/api/onboarding/local/status')
    expect(res.status).toBe(200)
    expect(res.body.configured).toBe(true)
    expect(res.body.running).toBe(true)
  })
})
