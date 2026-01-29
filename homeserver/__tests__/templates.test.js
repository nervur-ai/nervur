import { describe, it, expect } from 'vitest'
import { generateSecret, generateDockerCompose, generateTuwunelConfig } from '../templates.js'

describe('generateSecret', () => {
  it('returns a hex string of correct length', () => {
    const secret = generateSecret(16)
    expect(secret).toHaveLength(32) // 16 bytes = 32 hex chars
    expect(secret).toMatch(/^[0-9a-f]+$/)
  })

  it('defaults to 32 bytes', () => {
    const secret = generateSecret()
    expect(secret).toHaveLength(64)
  })

  it('generates unique values', () => {
    const a = generateSecret()
    const b = generateSecret()
    expect(a).not.toBe(b)
  })
})

describe('generateDockerCompose', () => {
  it('generates valid YAML with defaults', () => {
    const yml = generateDockerCompose()
    expect(yml).toContain('ghcr.io/matrix-construct/tuwunel:latest')
    expect(yml).toContain('container_name: nervur-homeserver')
    expect(yml).toContain('"8008:8008"')
    expect(yml).toContain('./tuwunel.toml:/etc/tuwunel.toml:ro')
    expect(yml).toContain('./data:/data')
    expect(yml).toContain('healthcheck:')
  })

  it('respects custom options', () => {
    const yml = generateDockerCompose({ containerName: 'my-hs', port: 9999, dataDir: '/custom/data' })
    expect(yml).toContain('container_name: my-hs')
    expect(yml).toContain('"9999:8008"')
    expect(yml).toContain('/custom/data:/data')
  })

  it('includes cloudflared service when tunnelToken is provided', () => {
    const yml = generateDockerCompose({ tunnelToken: 'eyJ0ZXN0IjoidG9rZW4ifQ==' })
    expect(yml).toContain('cloudflare/cloudflared:latest')
    expect(yml).toContain('container_name: nervur-cloudflared')
    expect(yml).toContain('TUNNEL_TOKEN')
    expect(yml).toContain('depends_on:')
  })

  it('does not include cloudflared when tunnelToken is absent', () => {
    const yml = generateDockerCompose()
    expect(yml).not.toContain('cloudflared')
  })

  it('includes external nervur network', () => {
    const yml = generateDockerCompose()
    expect(yml).toContain('networks:')
    expect(yml).toContain('nervur:')
    expect(yml).toContain('external: true')
  })

  it('connects homeserver to nervur network', () => {
    const yml = generateDockerCompose()
    // homeserver service should have networks: - nervur
    expect(yml).toContain('networks:\n      - nervur')
  })
})

describe('generateTuwunelConfig', () => {
  it('generates TOML with defaults', () => {
    const toml = generateTuwunelConfig({ registrationSecret: 'abc123' })
    expect(toml).toContain('server_name = "nervur.local"')
    expect(toml).toContain('port = 8008')
    expect(toml).toContain('allow_registration = true')
    expect(toml).toContain('registration_token = "abc123"')
    expect(toml).toContain('database_path = "/data/rocksdb"')
  })

  it('respects custom server name and port', () => {
    const toml = generateTuwunelConfig({ serverName: 'example.org', port: 9000, registrationSecret: 'x' })
    expect(toml).toContain('server_name = "example.org"')
    expect(toml).toContain('address = "0.0.0.0"')
    expect(toml).toContain('port = 8008')
    expect(toml).toContain('client = "http://localhost:9000"')
  })

  it('uses https well_known with port 443 when tunnel and domain are provided', () => {
    const toml = generateTuwunelConfig({ registrationSecret: 'x', tunnelToken: 'tok', domain: 'matrix.example.com' })
    expect(toml).toContain('client = "https://matrix.example.com"')
    expect(toml).toContain('server = "matrix.example.com:443"')
    expect(toml).not.toContain('http://localhost')
  })

  it('uses https well_known with port 8448 for delegation without tunnel', () => {
    const toml = generateTuwunelConfig({
      serverName: 'example.com',
      registrationSecret: 'x',
      domain: 'matrix.example.com'
    })
    expect(toml).toContain('client = "https://matrix.example.com"')
    expect(toml).toContain('server = "matrix.example.com:8448"')
    expect(toml).not.toContain('http://localhost')
  })

  it('skips delegation well_known when domain equals serverName and no tunnel', () => {
    const toml = generateTuwunelConfig({
      serverName: 'example.com',
      registrationSecret: 'x',
      domain: 'example.com',
      port: 8008
    })
    expect(toml).toContain('client = "http://localhost:8008"')
    expect(toml).not.toContain('8448')
  })

  it('uses tunnel port 443 even when domain equals serverName', () => {
    const toml = generateTuwunelConfig({
      serverName: 'example.com',
      registrationSecret: 'x',
      domain: 'example.com',
      tunnelToken: 'tok'
    })
    expect(toml).toContain('client = "https://example.com"')
    expect(toml).toContain('server = "example.com:443"')
  })

  it('uses localhost well_known when no domain and no tunnel', () => {
    const toml = generateTuwunelConfig({ registrationSecret: 'x', port: 8008 })
    expect(toml).toContain('client = "http://localhost:8008"')
    expect(toml).not.toContain('https://')
  })
})
