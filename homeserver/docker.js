import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const TUWUNEL_IMAGE = 'ghcr.io/matrix-construct/tuwunel:latest'

async function run(cmd, args, opts = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 120_000, ...opts })
    return { stdout: stdout.trim(), stderr: stderr.trim() }
  } catch (err) {
    const message = err.stderr?.trim() || err.stdout?.trim() || err.message
    throw new Error(`${cmd} ${args[0]} failed: ${message}`)
  }
}

export async function checkDocker() {
  const { stdout: version } = await run('docker', ['--version'])
  // docker info validates the daemon is running
  await run('docker', ['info', '--format', '{{.ServerVersion}}'])
  return { version }
}

export async function pullImage(name = TUWUNEL_IMAGE) {
  const { stdout } = await run('docker', ['pull', name], { timeout: 300_000 })
  return { output: stdout }
}

export async function composeUp(dir) {
  const { stdout } = await run('docker', ['compose', 'up', '-d'], { cwd: dir, timeout: 60_000 })
  return { output: stdout }
}

export async function composeDown(dir) {
  const { stdout } = await run('docker', ['compose', 'down'], { cwd: dir, timeout: 60_000 })
  return { output: stdout }
}

export async function composeRestart(dir) {
  const { stdout } = await run('docker', ['compose', 'restart'], { cwd: dir, timeout: 60_000 })
  return { output: stdout }
}

export async function getContainerStatus(name) {
  try {
    // Use JSON output — robust regardless of whether healthcheck is configured
    const { stdout } = await run('docker', ['inspect', '--format', '{{json .State}}', name])
    const state = JSON.parse(stdout)
    const status = state.Status || 'unknown'
    const health = state.Health?.Status || 'none'
    return { running: status === 'running', healthy: health === 'healthy' || health === 'none', status, health }
  } catch {
    return { running: false, healthy: false, status: 'not_found', health: 'none' }
  }
}

export async function waitForHealthy(name, timeout = 60_000, url = null) {
  const start = Date.now()
  const interval = 2000

  while (Date.now() - start < timeout) {
    // Try URL health check first if provided
    if (url) {
      try {
        const res = await fetch(`${url}/_matrix/client/versions`, { signal: AbortSignal.timeout(3000) })
        if (res.ok) return { healthy: true, elapsed: Date.now() - start }
      } catch {
        // not ready yet
      }
    } else {
      const status = await getContainerStatus(name)
      if (status.healthy) return { healthy: true, elapsed: Date.now() - start }
    }

    await new Promise((r) => setTimeout(r, interval))
  }

  return { healthy: false, elapsed: Date.now() - start }
}

export async function testEndpoint(url) {
  const res = await fetch(`${url}/_matrix/client/versions`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Endpoint returned HTTP ${res.status}`)
  const data = await res.json()
  if (!data.versions?.length) throw new Error('Invalid response: no versions')
  return { url, versions: data.versions }
}

export async function getContainerLogs(name, tail = 50) {
  const { stdout } = await run('docker', ['logs', '--tail', String(tail), name])
  return { logs: stdout }
}

// Find all containers (running and stopped) using the Tuwunel image (any tag)
export async function findTuwunelContainers() {
  try {
    const { stdout } = await run('docker', [
      'ps',
      '-a',
      '--filter',
      'ancestor=ghcr.io/matrix-construct/tuwunel',
      '--format',
      '{{.Names}}\t{{.Ports}}\t{{.Status}}\t{{.State}}'
    ])
    if (!stdout) return []
    return stdout.split('\n').map((line) => {
      const [name, ports, status, state] = line.split('\t')
      // Extract host port from e.g. "0.0.0.0:8008->8008/tcp"
      const portMatch = ports?.match(/(\d+)->/)
      return { name, port: portMatch ? parseInt(portMatch[1], 10) : null, status, running: state === 'running' }
    })
  } catch {
    return []
  }
}
