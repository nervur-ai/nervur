import { Router } from 'express'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { readConfig, updateConfig } from '../brain/config.js'
import { runPreflight, configure, pull, start, verify, getStatus } from './provision.js'
import { checkPort } from './validation.js'
import { generateDockerCompose } from './templates.js'
import {
  composeUp,
  composeRestart,
  waitForHealthy,
  getContainerStatus,
  getContainerLogs,
  resolveHostPath
} from './docker.js'

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const HS_DIR = join(DATA_DIR, 'homeserver')

const router = Router()

// Check Docker + ports + write permissions
router.post('/preflight', async (_req, res) => {
  try {
    const result = await runPreflight(HS_DIR)
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Check if a port is available
router.post('/check-port', async (req, res) => {
  const { port } = req.body
  if (!port || port < 1 || port > 65535) {
    return res.status(400).json({ available: false, error: 'Invalid port number' })
  }
  try {
    const result = await checkPort(port)
    res.json(result)
  } catch (err) {
    res.status(500).json({ available: false, error: err.message })
  }
})

// Generate config files and save registrationSecret
router.post('/configure', async (req, res) => {
  const { serverName, port } = req.body
  try {
    const result = await configure(HS_DIR, { serverName, port })

    // Save progress to YAML (nested under onboarding.server)
    updateConfig({
      onboarding: {
        path: 'local',
        step: 'server',
        server: {
          serverName: result.serverName,
          port: result.port,
          registrationSecret: result.registrationSecret
        }
      }
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Pull Tuwunel Docker image
router.post('/pull', async (_req, res) => {
  try {
    const result = await pull()
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Start container + wait for healthy
router.post('/start', async (_req, res) => {
  try {
    const config = readConfig() || {}
    const onboarding = config.onboarding || {}
    const port = onboarding.server?.port || 8008
    const result = await start(HS_DIR, undefined, port)
    if (!result.success) {
      return res.status(502).json(result)
    }
    updateConfig({
      onboarding: {
        server: {
          url: result.url,
          serverName: onboarding.server?.serverName || 'nervur.local'
        }
      }
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Verify the running homeserver
router.post('/verify', async (req, res) => {
  try {
    const config = readConfig()
    let url = req.body?.url || config?.onboarding?.server?.url || 'http://localhost:8008'
    // Inside Docker, localhost doesn't reach the host — use container name via shared network
    const isDocker = existsSync('/.dockerenv')
    if (isDocker && url.includes('localhost')) {
      const port = new URL(url).port || '8008'
      url = `http://nervur-homeserver:${port}`
    }
    const result = await verify(url)
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Check current status (for resume)
router.get('/status', async (_req, res) => {
  try {
    const status = await getStatus(HS_DIR)
    const config = readConfig()
    const onboarding = config?.onboarding || {}
    const server = onboarding.server || {}

    // Fall back to reading registration_token from tuwunel.toml if not in saved config
    let registrationSecret = server.registrationSecret
    let serverName = server.serverName
    if (!registrationSecret || !serverName) {
      try {
        const toml = readFileSync(join(HS_DIR, 'tuwunel.toml'), 'utf8')
        if (!registrationSecret) {
          const match = toml.match(/registration_token\s*=\s*"([^"]+)"/)
          if (match) registrationSecret = match[1]
        }
        if (!serverName) {
          const match = toml.match(/server_name\s*=\s*"([^"]+)"/)
          if (match) serverName = match[1]
        }
      } catch (_e) {
        // toml not found — that's ok
      }
    }

    res.json({
      ...status,
      serverName,
      registrationSecret,
      homeserver: server.url ? { url: server.url, serverName: server.serverName } : undefined
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Networking endpoints ──

router.post('/networking/check-dns', async (req, res) => {
  const { domain } = req.body
  if (!domain) return res.status(400).json({ success: false, error: 'Domain is required' })
  try {
    const dns = await import('dns')
    const addresses = await dns.promises.resolve4(domain)
    res.json({ success: true, addresses })
  } catch (err) {
    res.status(400).json({ success: false, error: `DNS resolution failed for ${domain}: ${err.message}` })
  }
})

router.post('/networking/configure-tunnel', async (req, res) => {
  const { domain, tunnelToken, mode } = req.body
  if (!domain) {
    return res.status(400).json({ success: false, error: 'domain is required' })
  }
  try {
    const config = readConfig() || {}
    const onboarding = config.onboarding || {}
    const server = onboarding.server || {}
    const port = server.port || 8008
    const isDocker = existsSync('/.dockerenv')

    // Read serverName from existing tuwunel.toml (source of truth)
    let _serverName
    try {
      const toml = readFileSync(join(HS_DIR, 'tuwunel.toml'), 'utf8')
      const snMatch = toml.match(/server_name\s*=\s*"([^"]+)"/)
      _serverName = snMatch?.[1]
    } catch (_e) {
      // fall back to config
    }
    _serverName = _serverName || server.serverName || 'nervur.local'

    // If tunnelToken provided, rewrite docker-compose with cloudflared service
    if (tunnelToken) {
      let dataDir = './data'
      let configDir = null
      if (isDocker) {
        const hostDataPath = await resolveHostPath('nervur-brain', '/app/data')
        if (hostDataPath) {
          const hostHsDir = `${hostDataPath}/homeserver`
          dataDir = `${hostHsDir}/data`
          configDir = hostHsDir
        }
      }
      const compose = generateDockerCompose({ port, tunnelToken, dataDir, configDir })
      writeFileSync(join(HS_DIR, 'docker-compose.yml'), compose, 'utf8')
    }

    // Federation port: 443 for tunnel (HTTPS only), 8448 for direct route
    const federationPort = mode === 'direct' ? 8448 : 443

    // Update tuwunel.toml: add/update well_known
    let toml = readFileSync(join(HS_DIR, 'tuwunel.toml'), 'utf8')
    if (toml.includes('[global.well_known]')) {
      toml = toml.replace(/client = "[^"]+"/, `client = "https://${domain}"`)
      toml = toml.replace(/server = "[^"]+"/, `server = "${domain}:${federationPort}"`)
    } else {
      toml += `\n[global.well_known]\nclient = "https://${domain}"\nserver = "${domain}:${federationPort}"\n`
    }
    writeFileSync(join(HS_DIR, 'tuwunel.toml'), toml, 'utf8')

    // Restart HS to pick up tuwunel.toml changes, then compose up starts cloudflared
    await composeRestart(HS_DIR)
    await composeUp(HS_DIR)

    // Wait for homeserver to be healthy
    const healthUrl = isDocker ? `http://nervur-homeserver:8008` : `http://localhost:${port}`
    const health = await waitForHealthy('nervur-homeserver', 60_000, healthUrl)
    if (!health.healthy) {
      return res
        .status(502)
        .json({ success: false, error: 'Homeserver did not become healthy after tunnel reconfiguration' })
    }

    // Save networking config (deep merge — no spread needed)
    const networking = { networkMode: 'public', domain }
    if (tunnelToken) networking.tunnelToken = tunnelToken
    updateConfig({
      onboarding: {
        step: 'network',
        networking
      }
    })

    // Also update final homeserver config if it exists
    if (config.homeserver) {
      const hsUpdate = { ...config.homeserver, networkMode: 'public', domain }
      if (tunnelToken) hsUpdate.tunnelToken = tunnelToken
      updateConfig({ homeserver: hsUpdate })
    }

    res.json({ success: true, publicUrl: `https://${domain}` })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/networking/check-tunnel', async (req, res) => {
  const { domain } = req.body
  if (!domain) return res.status(400).json({ success: false, error: 'Domain is required' })

  try {
    const clientUrl = `https://${domain}/_matrix/client/versions`
    const tunnelRes = await fetch(clientUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'application/json' }
    })

    if (tunnelRes.ok) {
      const data = await tunnelRes.json()
      return res.json({ success: true, versions: data.versions, publicUrl: `https://${domain}` })
    }

    // Non-200: distinguish Cloudflare error (tunnel down) from HS error
    const body = await tunnelRes.text()
    if (body.includes('error code:')) {
      return res.json({
        success: false,
        error: `Tunnel not connected (Cloudflare ${body.trim()}). Start or restart cloudflared.`
      })
    }
    res.json({
      success: false,
      tunnelConnected: true,
      error: `Tunnel works but homeserver returned HTTP ${tunnelRes.status}`
    })
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      res.json({ success: false, error: 'Connection timed out — tunnel may still be connecting' })
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      res.json({ success: false, error: 'Tunnel not responding. Make sure cloudflared is running.' })
    } else {
      res.json({ success: false, error: `Tunnel check failed: ${err.message}` })
    }
  }
})

router.post('/networking/check-cloudflared', async (_req, res) => {
  try {
    const status = await getContainerStatus('nervur-cloudflared')
    if (!status.running) {
      // Check logs for error details (bad token, etc.)
      let errorDetail = ''
      try {
        const { logs } = await getContainerLogs('nervur-cloudflared', 10)
        if (logs.includes('Unauthorized') || logs.includes('failed to authenticate') || logs.includes('not valid')) {
          errorDetail = 'Invalid tunnel token. Check the token in your Cloudflare Zero Trust dashboard.'
        } else if (logs.includes('failed to connect')) {
          errorDetail = 'Cloudflared cannot reach Cloudflare. Check your internet connection.'
        } else if (logs) {
          errorDetail = logs.split('\n').filter(Boolean).pop() || ''
        }
      } catch {
        // container may not exist yet
      }
      return res.json({
        success: false,
        running: false,
        status: status.status,
        error: errorDetail || `Cloudflared is ${status.status}. It may have a bad token or configuration.`
      })
    }
    res.json({ success: true, running: true, status: status.status })
  } catch (err) {
    res.json({ success: false, running: false, error: err.message })
  }
})

router.post('/networking/save', async (req, res) => {
  try {
    const { networkMode = 'local', domain } = req.body || {}
    const networking = { networkMode }
    if (networkMode === 'public' && domain) {
      networking.domain = domain
    }
    updateConfig({
      onboarding: {
        step: 'network',
        networking
      }
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
