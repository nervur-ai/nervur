import { join, dirname } from 'path'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import {
  checkDocker,
  pullImage,
  composeUp,
  composeDown,
  waitForHealthy,
  testEndpoint,
  getContainerStatus,
  findTuwunelContainers,
  ensureNetwork,
  connectToNetwork
} from './docker.js'
import { checkPorts, checkWritePermissions } from './validation.js'
import { generateDockerCompose, generateTuwunelConfig, generateSecret } from './templates.js'

const CONTAINER_NAME = 'nervur-homeserver'
const HS_PORT = 8008

export async function runPreflight(hsDir) {
  const results = []

  // Check Docker
  try {
    const { version } = await checkDocker()
    results.push({ id: 'docker', label: 'Docker available', status: 'pass', message: version })
  } catch (err) {
    results.push({
      id: 'docker',
      label: 'Docker available',
      status: 'fail',
      message: err.message,
      help: 'Install Docker and make sure the Docker daemon is running.'
    })
    return { success: false, existing: false, results }
  }

  // Detect any running Tuwunel containers
  const tuwunelContainers = await findTuwunelContainers()
  if (tuwunelContainers.length > 0) {
    const names = tuwunelContainers.map((c) => `${c.name} (:${c.port})`).join(', ')
    results.push({
      id: 'existing',
      label: 'Existing Tuwunel',
      status: 'pass',
      message: `Found running: ${names}`
    })
    return { success: true, existing: true, tuwunelContainers, results }
  }

  // No Tuwunel running — probe default port
  let defaultPortBusy = false
  let matrixOnPort = false
  const portResults = await checkPorts([HS_PORT])
  if (portResults[0]?.available === false) {
    defaultPortBusy = true
    // Something is on port 8008 — is it a Matrix homeserver?
    try {
      await testEndpoint(`http://localhost:${HS_PORT}`)
      matrixOnPort = true
      results.push({
        id: 'ports',
        label: 'Default port',
        status: 'pass',
        message: `Matrix homeserver found on port ${HS_PORT}`
      })
    } catch {
      results.push({
        id: 'ports',
        label: 'Default port',
        status: 'warn',
        message: `Port ${HS_PORT} is in use by another service`
      })
    }
  } else {
    results.push({
      id: 'ports',
      label: 'Default port',
      status: 'pass',
      message: `Port ${HS_PORT} is free`
    })
  }

  // Check write permissions — walk up to nearest existing ancestor
  let checkDir = hsDir
  while (!existsSync(checkDir)) checkDir = dirname(checkDir)
  const writePerm = await checkWritePermissions(checkDir)
  if (!writePerm.writable) {
    results.push({
      id: 'write',
      label: 'Write permissions',
      status: 'fail',
      message: `Cannot write to ${checkDir}`,
      help: 'Check directory permissions.'
    })
  } else {
    results.push({
      id: 'write',
      label: 'Write permissions',
      status: 'pass',
      message: 'Directory is writable'
    })
  }

  const success = results.every((r) => r.status !== 'fail')
  return { success, existing: false, defaultPortBusy, matrixOnPort, results }
}

export async function configure(hsDir, { serverName = 'nervur.local', port = HS_PORT } = {}) {
  const containerName = CONTAINER_NAME
  const dataDir = './data'

  // Check if server_name changed since last setup.
  // Tuwunel stores server_name in RocksDB and cannot change it after first startup.
  // If it changed, we must stop the container and wipe the data directory.
  const tomlPath = join(hsDir, 'tuwunel.toml')
  if (existsSync(tomlPath)) {
    const existing = readFileSync(tomlPath, 'utf8')
    const snMatch = existing.match(/server_name\s*=\s*"([^"]+)"/)
    if (snMatch && snMatch[1] !== serverName) {
      // Server name changed — stop container and wipe data
      try {
        await composeDown(hsDir)
      } catch {
        // Container may not exist
      }
      const dataPath = join(hsDir, 'data')
      if (existsSync(dataPath)) {
        rmSync(dataPath, { recursive: true, force: true })
      }
    }
  }

  // Reuse existing secret if config files are already present and server_name didn't change
  let registrationSecret
  if (existsSync(tomlPath)) {
    const existing = readFileSync(tomlPath, 'utf8')
    const match = existing.match(/registration_token\s*=\s*"([^"]+)"/)
    if (match) registrationSecret = match[1]
  }
  if (!registrationSecret) registrationSecret = generateSecret()

  // Ensure directories exist
  mkdirSync(join(hsDir, 'data'), { recursive: true })

  // Write config files
  writeFileSync(join(hsDir, 'docker-compose.yml'), generateDockerCompose({ containerName, dataDir, port }))
  writeFileSync(join(hsDir, 'tuwunel.toml'), generateTuwunelConfig({ serverName, port, registrationSecret }))

  return { success: true, registrationSecret, containerName, serverName, port }
}

export async function pull() {
  const { output } = await pullImage()
  return { success: true, output }
}

const isDocker = existsSync('/.dockerenv')

export async function start(hsDir, containerName = CONTAINER_NAME, port = HS_PORT) {
  // Ensure shared Docker network exists (brain is already on it via deploy.sh compose)
  await ensureNetwork('nervur')
  await composeUp(hsDir)

  // Use container name for health check when in Docker, localhost otherwise
  const healthUrl = isDocker ? `http://${containerName}:8008` : `http://localhost:${port}`
  const health = await waitForHealthy(containerName, 60_000, healthUrl)
  if (!health.healthy) {
    return { success: false, error: 'Homeserver did not become healthy within timeout' }
  }

  // Return the URL the brain should use to talk to homeserver
  const url = isDocker ? `http://${containerName}:8008` : `http://localhost:${port}`
  return { success: true, url, elapsed: health.elapsed }
}

export async function verify(hsUrl) {
  try {
    const result = await testEndpoint(hsUrl)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function getStatus(hsDir, containerName = CONTAINER_NAME) {
  const dirExists = existsSync(join(hsDir, 'docker-compose.yml'))
  if (!dirExists) return { configured: false, running: false, healthy: false }

  const status = await getContainerStatus(containerName)
  return { configured: true, ...status }
}
