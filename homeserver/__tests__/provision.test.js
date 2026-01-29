import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync } from 'fs'
import { readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'

// Mock docker.js and validation.js
vi.mock('../docker.js', () => ({
  checkDocker: vi.fn(),
  pullImage: vi.fn(),
  composeUp: vi.fn(),
  waitForHealthy: vi.fn(),
  testEndpoint: vi.fn(),
  getContainerStatus: vi.fn(),
  findTuwunelContainers: vi.fn()
}))

vi.mock('../validation.js', () => ({
  checkPorts: vi.fn(),
  checkWritePermissions: vi.fn()
}))

const docker = await import('../docker.js')
const validation = await import('../validation.js')
const { runPreflight, configure, pull, start, verify, getStatus } = await import('../provision.js')

let tmpDir

beforeEach(() => {
  vi.restoreAllMocks()
  tmpDir = mkdtempSync(join(tmpdir(), 'nervur-test-'))
})

describe('runPreflight', () => {
  it('returns success when all checks pass and nothing existing', async () => {
    docker.checkDocker.mockResolvedValue({ version: 'Docker 24.0.0' })
    docker.findTuwunelContainers.mockResolvedValue([])
    validation.checkPorts.mockResolvedValue([{ port: 8008, available: true }])
    validation.checkWritePermissions.mockResolvedValue({ dir: tmpDir, writable: true })

    const result = await runPreflight(join(tmpDir, 'hs'))
    expect(result.success).toBe(true)
    expect(result.existing).toBe(false)
    expect(result.results).toHaveLength(3)
    expect(result.results.every((r) => r.status === 'pass')).toBe(true)
  })

  it('returns existing true when Tuwunel containers are running', async () => {
    docker.checkDocker.mockResolvedValue({ version: 'Docker 24.0.0' })
    docker.findTuwunelContainers.mockResolvedValue([{ name: 'nervur-homeserver', port: 8008, status: 'Up 5 minutes' }])

    const result = await runPreflight(join(tmpDir, 'hs'))
    expect(result.success).toBe(true)
    expect(result.existing).toBe(true)
    expect(result.tuwunelContainers).toHaveLength(1)
    expect(result.tuwunelContainers[0].port).toBe(8008)
    // Should NOT have checked ports
    expect(result.results.find((r) => r.id === 'ports')).toBeUndefined()
  })

  it('fails early if docker is not available', async () => {
    docker.checkDocker.mockRejectedValue(new Error('docker not found'))

    const result = await runPreflight(join(tmpDir, 'hs'))
    expect(result.success).toBe(false)
    expect(result.existing).toBe(false)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].id).toBe('docker')
    expect(result.results[0].status).toBe('fail')
  })

  it('detects Matrix on busy port', async () => {
    docker.checkDocker.mockResolvedValue({ version: 'Docker 24.0.0' })
    docker.findTuwunelContainers.mockResolvedValue([])
    validation.checkPorts.mockResolvedValue([{ port: 8008, available: false }])
    docker.testEndpoint.mockResolvedValue({ url: 'http://localhost:8008', versions: ['v1.6'] })
    validation.checkWritePermissions.mockResolvedValue({ dir: tmpDir, writable: true })

    const result = await runPreflight(join(tmpDir, 'hs'))
    expect(result.success).toBe(true)
    expect(result.matrixOnPort).toBe(true)
    expect(result.defaultPortBusy).toBe(true)
  })

  it('warns about busy non-Matrix port', async () => {
    docker.checkDocker.mockResolvedValue({ version: 'Docker 24.0.0' })
    docker.findTuwunelContainers.mockResolvedValue([])
    validation.checkPorts.mockResolvedValue([{ port: 8008, available: false }])
    docker.testEndpoint.mockRejectedValue(new Error('connection refused'))
    validation.checkWritePermissions.mockResolvedValue({ dir: tmpDir, writable: true })

    const result = await runPreflight(join(tmpDir, 'hs'))
    expect(result.success).toBe(true)
    expect(result.defaultPortBusy).toBe(true)
    expect(result.matrixOnPort).toBe(false)
    const portCheck = result.results.find((r) => r.id === 'ports')
    expect(portCheck.status).toBe('warn')
  })
})

describe('configure', () => {
  it('writes config files to the directory', async () => {
    const hsDir = join(tmpDir, 'homeserver')
    const result = await configure(hsDir, { serverName: 'test.local' })

    expect(result.success).toBe(true)
    expect(result.registrationSecret).toBeTruthy()
    expect(result.serverName).toBe('test.local')

    // Verify files were written
    expect(existsSync(join(hsDir, 'docker-compose.yml'))).toBe(true)
    expect(existsSync(join(hsDir, 'tuwunel.toml'))).toBe(true)
    expect(existsSync(join(hsDir, '.env'))).toBe(true)
    expect(existsSync(join(hsDir, 'data'))).toBe(true)

    const compose = readFileSync(join(hsDir, 'docker-compose.yml'), 'utf8')
    expect(compose).toContain('tuwunel')

    const toml = readFileSync(join(hsDir, 'tuwunel.toml'), 'utf8')
    expect(toml).toContain('server_name = "test.local"')
    expect(toml).toContain(result.registrationSecret)
  })
})

describe('pull', () => {
  it('calls pullImage and returns success', async () => {
    docker.pullImage.mockResolvedValue({ output: 'Pulled successfully' })
    const result = await pull()
    expect(result.success).toBe(true)
    expect(docker.pullImage).toHaveBeenCalled()
  })

  it('throws on pull failure', async () => {
    docker.pullImage.mockRejectedValue(new Error('pull failed'))
    await expect(pull()).rejects.toThrow('pull failed')
  })
})

describe('start', () => {
  it('returns success when container becomes healthy', async () => {
    docker.composeUp.mockResolvedValue({ output: '' })
    docker.waitForHealthy.mockResolvedValue({ healthy: true, elapsed: 5000 })

    const result = await start(tmpDir)
    expect(result.success).toBe(true)
    expect(result.url).toBe('http://localhost:8008')
  })

  it('returns failure when container does not become healthy', async () => {
    docker.composeUp.mockResolvedValue({ output: '' })
    docker.waitForHealthy.mockResolvedValue({ healthy: false, elapsed: 60000 })

    const result = await start(tmpDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain('healthy')
  })
})

describe('verify', () => {
  it('returns success when endpoint responds', async () => {
    docker.testEndpoint.mockResolvedValue({ url: 'http://localhost:8008', versions: ['v1.6'] })
    const result = await verify('http://localhost:8008')
    expect(result.success).toBe(true)
    expect(result.versions).toContain('v1.6')
  })

  it('returns failure when endpoint fails', async () => {
    docker.testEndpoint.mockRejectedValue(new Error('connection refused'))
    const result = await verify('http://localhost:8008')
    expect(result.success).toBe(false)
    expect(result.error).toContain('connection refused')
  })
})

describe('getStatus', () => {
  it('returns not configured if no compose file', async () => {
    const result = await getStatus(join(tmpDir, 'nonexistent'))
    expect(result.configured).toBe(false)
    expect(result.running).toBe(false)
  })

  it('returns container status when configured', async () => {
    // Create a compose file to mark as configured
    const hsDir = join(tmpDir, 'hs')
    const { mkdirSync, writeFileSync } = await import('fs')
    mkdirSync(hsDir, { recursive: true })
    writeFileSync(join(hsDir, 'docker-compose.yml'), 'services: {}')

    docker.getContainerStatus.mockResolvedValue({ running: true, healthy: true, status: 'running', health: 'healthy' })

    const result = await getStatus(hsDir)
    expect(result.configured).toBe(true)
    expect(result.running).toBe(true)
    expect(result.healthy).toBe(true)
  })
})
