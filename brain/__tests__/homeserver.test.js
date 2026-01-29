import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  verifyHomeserver,
  getServerName,
  generateRegistrationKey,
  deriveBrainPassword,
  runPreflightChecks
} from '../homeserver.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('verifyHomeserver', () => {
  // Helper: mock fetch for verifyHomeserver tests
  function mockFetch(handler) {
    vi.stubGlobal('fetch', vi.fn(handler))
  }

  // Default: .well-known fails, federation/capabilities fail, versions works
  function defaultMock(overrides = {}) {
    mockFetch((url) => {
      if (url.includes('.well-known')) {
        return overrides.wellKnown || Promise.resolve({ ok: false })
      }
      if (url.includes('/federation/')) {
        return overrides.federation || Promise.resolve({ ok: false })
      }
      if (url.includes('/capabilities')) {
        return overrides.capabilities || Promise.resolve({ ok: false })
      }
      if (url.includes('/versions')) {
        return (
          overrides.versions ||
          Promise.resolve({ ok: true, json: () => Promise.resolve({ versions: ['v1.1', 'v1.6'] }) })
        )
      }
      return Promise.resolve({ ok: false })
    })
  }

  it('returns url, serverName, and versions on success', async () => {
    defaultMock()
    const info = await verifyHomeserver('http://localhost:8008/')
    expect(info.url).toBe('http://localhost:8008')
    expect(info.serverName).toBe('localhost')
    expect(info.versions).toContain('v1.1')
  })

  it('adds https:// when no protocol given', async () => {
    defaultMock()
    const info = await verifyHomeserver('nervur.com')
    expect(info.url).toBe('https://nervur.com')
    expect(info.serverName).toBe('nervur.com')
  })

  it('discovers HS via .well-known', async () => {
    defaultMock({
      wellKnown: Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ 'm.homeserver': { base_url: 'https://matrix.nervur.com' } })
      })
    })
    const info = await verifyHomeserver('nervur.com')
    expect(info.url).toBe('https://matrix.nervur.com')
    expect(info.serverName).toBe('nervur.com')
    expect(info.versions).toContain('v1.6')
  })

  it('strips trailing slashes from url', async () => {
    defaultMock({ versions: Promise.resolve({ ok: true, json: () => Promise.resolve({ versions: ['v1.1'] }) }) })
    const info = await verifyHomeserver('http://localhost:8008///')
    expect(info.url).toBe('http://localhost:8008')
  })

  it('returns server software info when available', async () => {
    defaultMock({
      federation: Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ server: { name: 'Synapse', version: '1.98.0' } })
      })
    })
    const info = await verifyHomeserver('http://localhost:8008')
    expect(info.server).toEqual({ name: 'Synapse', version: '1.98.0' })
  })

  it('returns capabilities when available', async () => {
    defaultMock({
      capabilities: Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            capabilities: {
              'm.room_versions': { default: '10' },
              'm.change_password': { enabled: true },
              'm.set_displayname': { enabled: true }
            }
          })
      })
    })
    const info = await verifyHomeserver('http://localhost:8008')
    expect(info.capabilities.defaultRoomVersion).toBe('10')
    expect(info.capabilities.changePassword).toBe(true)
    expect(info.capabilities.setDisplayname).toBe(true)
  })

  it('returns unstable features when present', async () => {
    defaultMock({
      versions: Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            versions: ['v1.1'],
            unstable_features: { 'org.matrix.msc3440.stable': true, 'org.matrix.msc2716': false }
          })
      })
    })
    const info = await verifyHomeserver('http://localhost:8008')
    expect(info.unstableFeatures).toEqual(['org.matrix.msc3440.stable'])
  })

  it('throws when homeserver is not reachable', async () => {
    defaultMock({ versions: Promise.resolve({ ok: false, status: 404 }) })
    await expect(verifyHomeserver('http://bad:8008')).rejects.toThrow('Not a Matrix homeserver')
  })

  it('throws when response has no versions', async () => {
    defaultMock({ versions: Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) })
    await expect(verifyHomeserver('http://localhost:8008')).rejects.toThrow('Not a Matrix homeserver')
  })
})

describe('getServerName', () => {
  it('extracts hostname from URL', () => {
    expect(getServerName('https://matrix.example.com')).toBe('matrix.example.com')
  })

  it('extracts hostname ignoring port', () => {
    expect(getServerName('http://my-server.com:8008')).toBe('my-server.com')
  })
})

describe('generateRegistrationKey', () => {
  it('returns a base64url string', () => {
    const key = generateRegistrationKey()
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(key.length).toBeGreaterThan(20)
  })

  it('generates unique keys', () => {
    const a = generateRegistrationKey()
    const b = generateRegistrationKey()
    expect(a).not.toBe(b)
  })
})

describe('deriveBrainPassword', () => {
  it('produces deterministic output', () => {
    const a = deriveBrainPassword('secret1', 'brain')
    const b = deriveBrainPassword('secret1', 'brain')
    expect(a).toBe(b)
  })

  it('produces different output for different keys', () => {
    const a = deriveBrainPassword('secret1', 'brain')
    const b = deriveBrainPassword('secret2', 'brain')
    expect(a).not.toBe(b)
  })

  it('produces different output for different usernames', () => {
    const a = deriveBrainPassword('secret1', 'brain')
    const b = deriveBrainPassword('secret1', 'other')
    expect(a).not.toBe(b)
  })
})

describe('runPreflightChecks', () => {
  it('returns fail on unreachable and stops early', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
    )

    const checks = await runPreflightChecks('http://bad:8008')
    expect(checks).toHaveLength(1)
    expect(checks[0].id).toBe('reachable')
    expect(checks[0].status).toBe('fail')
  })

  it('runs all checks when reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (url.includes('/versions')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ versions: ['v1.1', 'v1.6'] })
          })
        }
        if (url.includes('/register')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () =>
              Promise.resolve({
                flows: [{ stages: ['m.login.registration_token'] }],
                session: 'sess'
              })
          })
        }
        if (url.includes('/login')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ flows: [{ type: 'm.login.password' }] })
          })
        }
        return Promise.resolve({ ok: false, status: 404 })
      })
    )

    const checks = await runPreflightChecks('http://localhost:8008')
    expect(checks).toHaveLength(4)
    expect(checks.every((c) => c.status === 'pass')).toBe(true)
  })

  it('reports registration disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (url.includes('/versions')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ versions: ['v1.6'] })
          })
        }
        if (url.includes('/register')) {
          return Promise.resolve({
            ok: false,
            status: 403,
            json: () => Promise.resolve({ errcode: 'M_FORBIDDEN' })
          })
        }
        if (url.includes('/login')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ flows: [{ type: 'm.login.password' }] })
          })
        }
        return Promise.resolve({ ok: false, status: 404 })
      })
    )

    const checks = await runPreflightChecks('http://localhost:8008')
    const reg = checks.find((c) => c.id === 'registration')
    expect(reg.status).toBe('fail')
    expect(reg.help).toMatch(/enable_registration/)
  })
})
