import express from 'express'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { rmSync, readFileSync, existsSync } from 'fs'
import { execSync, spawn } from 'child_process'
import { readConfig, writeConfig, updateConfig, deleteConfig, isInitialized } from './config.js'
import {
  verifyHomeserver,
  generateRegistrationKey,
  registerBrain,
  runPreflightChecks,
  findExistingBrainAdminRoom,
  createBrainAdminRoom,
  joinTuwunelAdminRoom
} from './homeserver.js'
import { localRoutes } from '../homeserver/index.js'
import { getContainerStatus, composeUp, composeDown, composeRestart } from '../homeserver/docker.js'
import {
  listUsers,
  createUser,
  deactivateUser,
  listRooms,
  listBrainRooms,
  getRoomMembers,
  createRoom,
  inviteToRoom,
  getPendingInvites,
  acceptInvite,
  rejectInvite,
  addSSEClient,
  startSyncLoop,
  getRegistrationMode,
  setRegistrationMode,
  getRoomMessages,
  sendRoomMessage,
  getAllBrainMessages,
  getSkillState,
  updateSkillState,
  getSkillCode,
  saveSkillCode,
  findSkillRoomId
} from './matrix-admin.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const HS_DIR = join(DATA_DIR, 'homeserver')

const app = express()
app.use(express.json())

// Local homeserver provisioning routes
app.use('/api/onboarding/local', localRoutes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Version info — current + latest from GitHub
app.get('/api/version', async (_req, res) => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))
    const current = pkg.version

    let latest = null
    try {
      const r = await fetch('https://raw.githubusercontent.com/nervur-ai/nervur/master/package.json', {
        signal: AbortSignal.timeout(5000)
      })
      if (r.ok) {
        const remote = await r.json()
        latest = remote.version
      }
    } catch {
      // GitHub unreachable — that's fine, just don't show latest
    }

    res.json({ current, latest })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Self-update — pull new image and recreate container
app.post('/api/update', (_req, res) => {
  const composePath = '/opt/nervur/docker-compose.yml'
  if (!existsSync(composePath)) {
    return res.status(400).json({ error: 'Compose file not found — update manually' })
  }
  try {
    execSync('docker compose -f /opt/nervur/docker-compose.yml pull brain', { timeout: 60000 })
    res.json({ success: true, message: 'Image pulled, restarting...' })
    // Spawn a SEPARATE container to do the restart — running `docker compose up`
    // inside this container fails because docker kills this process when replacing it,
    // leaving the new container stuck in "Created" state.
    setTimeout(() => {
      spawn(
        'docker',
        [
          'run',
          '--rm',
          '-d',
          '-v',
          '/var/run/docker.sock:/var/run/docker.sock',
          '-v',
          '/opt/nervur:/opt/nervur:ro',
          'ghcr.io/nervur-ai/nervur:latest',
          'sh',
          '-c',
          'sleep 2 && docker compose -f /opt/nervur/docker-compose.yml up -d brain'
        ],
        { detached: true, stdio: 'ignore' }
      ).unref()
    }, 500)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/status', (req, res) => {
  const initialized = isInitialized()
  const result = { initialized, config: readConfig() }
  res.json(result)
})

// Hard reset — wipe config completely, restart onboarding from scratch
app.post('/api/onboarding/reset', (_req, res) => {
  deleteConfig()
  res.json({ success: true })
})

// Factory reset — wipe everything: config, homeserver data, tunnel, users
app.post('/api/onboarding/factory-reset', async (_req, res) => {
  const config = readConfig()
  try {
    // Stop containers first if local homeserver
    if (config?.homeserver?.type === 'local') {
      try {
        await composeDown(HS_DIR, { volumes: true })
      } catch {
        // containers may not exist, that's fine
      }
    }
    // Wipe the entire homeserver directory (docker-compose, tuwunel.toml, .env, rocksdb data)
    try {
      rmSync(HS_DIR, { recursive: true, force: true })
    } catch {
      // may not exist
    }
    // Wipe brain config
    deleteConfig()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Step 1: verify homeserver is reachable
app.post('/api/onboarding/verify-homeserver', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'url is required' })

  try {
    const info = await verifyHomeserver(url)
    // Persist progress — only essential config, no read-only data
    updateConfig({
      onboarding: {
        step: 'server',
        path: 'remote',
        server: { input: url, url: info.url, serverName: info.serverName }
      }
    })
    res.json(info)
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// Step 2: run preflight checks on the homeserver
app.post('/api/onboarding/preflight', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'url is required' })

  try {
    const checks = await runPreflightChecks(url)
    const allPassed = checks.every((c) => c.status !== 'fail')
    res.json({ checks, allPassed })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// Step 3: generate a new registration key
app.post('/api/onboarding/generate-key', (_req, res) => {
  res.json({ key: generateRegistrationKey() })
})

// Save identity progress before preflight
app.post('/api/onboarding/save-identity', (req, res) => {
  const { name, username, registrationKey } = req.body
  updateConfig({ onboarding: { step: 'brain', identity: { name, username, registrationKey } } })
  res.json({ success: true })
})

// Step 4: init brain identity on the homeserver
app.post('/api/onboarding/init-brain', async (req, res) => {
  const { url, serverName, name, username, registrationKey, type } = req.body
  if (!url) return res.status(400).json({ error: 'url is required' })
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' })
  if (!username?.trim()) return res.status(400).json({ error: 'username is required' })
  if (!registrationKey?.trim()) return res.status(400).json({ error: 'registrationKey is required' })

  try {
    const sn = serverName || new URL(url).hostname
    const result = await registerBrain(url, sn, {
      username: username.trim(),
      registrationKey: registrationKey.trim(),
      type: type || 'remote'
    })

    // Find or create the brain admin room
    let adminRoomId = await findExistingBrainAdminRoom(url, result.access_token)
    if (!adminRoomId) {
      adminRoomId = await createBrainAdminRoom(url, result.access_token, {
        brainUserId: result.user_id,
        name: name.trim()
      })
    }

    // Join the Tuwunel admin room (local HS only — brain is first user = admin)
    let tuwunelAdminRoomId = null
    if (type === 'local') {
      tuwunelAdminRoomId = await joinTuwunelAdminRoom(url, result.access_token, sn)
    }

    // Save brain + homeserver config (preserves onboarding state for local path's networking step)
    const final = {
      homeserver: {
        url,
        serverName: sn,
        type: type || 'remote',
        ...(tuwunelAdminRoomId && { tuwunel_admin_room_id: tuwunelAdminRoomId })
      },
      brain: {
        name: name.trim(),
        username: username.trim(),
        registrationKey: registrationKey.trim(),
        user_id: result.user_id,
        access_token: result.access_token,
        admin_room_id: adminRoomId
      }
    }
    updateConfig(final)

    res.json({ success: true, brain: final.brain })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// Step 5: finalize onboarding — move networking data to homeserver config, delete onboarding key
app.post('/api/onboarding/complete', (_req, res) => {
  try {
    const config = readConfig()
    if (!config) return res.status(400).json({ error: 'No config found' })

    // Move networking data from onboarding to homeserver
    const net = config.onboarding?.networking
    if (net && config.homeserver) {
      config.homeserver.networkMode = net.networkMode || 'local'
      if (net.domain) config.homeserver.domain = net.domain
      if (net.tunnelToken) config.homeserver.tunnelToken = net.tunnelToken
    }

    // Remove onboarding key — setup is complete
    delete config.onboarding
    writeConfig(config)

    res.json({ success: true, config })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Homeserver management (post-onboarding) ──

// Health check the configured homeserver (accepts ?url= fallback)
// Returns full server details: versions, server software, capabilities, unstable features
app.get('/api/homeserver/check', async (req, res) => {
  const config = readConfig()
  const url = req.query.url || config?.homeserver?.url
  if (!url) return res.json({ ok: false, error: 'No homeserver configured' })

  try {
    const info = await verifyHomeserver(url)
    res.json({ ok: true, ...info })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

// Check public tunnel/domain reachability (must be before :action)
app.post('/api/homeserver/check-public', async (req, res) => {
  const config = readConfig()
  const domain = req.body.domain || config?.homeserver?.domain
  if (!domain) return res.json({ ok: false, error: 'No public domain configured' })
  try {
    const r = await fetch(`https://${domain}/_matrix/client/versions`, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return res.json({ ok: false, error: `HTTP ${r.status}` })
    const data = await r.json()
    res.json({ ok: true, versions: data.versions })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

// Container status (local homeserver only)
app.get('/api/homeserver/status', async (_req, res) => {
  const config = readConfig()
  if (config?.homeserver?.type !== 'local') {
    return res.json({ available: false })
  }
  try {
    const hs = await getContainerStatus('nervur-homeserver')
    const cf = await getContainerStatus('nervur-cloudflared')
    res.json({ available: true, homeserver: hs, cloudflared: cf })
  } catch (err) {
    res.json({ available: false, error: err.message })
  }
})

// ── User management (local only) ──

app.get('/api/homeserver/users', async (_req, res) => {
  const config = readConfig()
  if (config?.homeserver?.type !== 'local') return res.status(400).json({ error: 'Not a local homeserver' })
  try {
    const users = await listUsers()
    res.json({ users })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/homeserver/users', async (req, res) => {
  const config = readConfig()
  if (config?.homeserver?.type !== 'local') return res.status(400).json({ error: 'Not a local homeserver' })
  const { username, password, displayName, isTest, isSkill, skillType } = req.body
  if (!username) return res.status(400).json({ error: 'username is required' })
  if (!isTest && !isSkill && !password) return res.status(400).json({ error: 'password is required' })
  try {
    const result = await createUser(username, password, displayName, !!isTest, !!isSkill, skillType || null)
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/homeserver/users/:userId', async (req, res) => {
  const config = readConfig()
  if (config?.homeserver?.type !== 'local') return res.status(400).json({ error: 'Not a local homeserver' })
  try {
    await deactivateUser(req.params.userId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Room management (local only) ──

app.get('/api/brain/rooms', async (_req, res) => {
  try {
    const rooms = await listBrainRooms()
    res.json({ rooms })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/brain/rooms/:id/messages', async (req, res) => {
  try {
    const messages = await getRoomMessages(req.params.id, parseInt(req.query.limit) || 50)
    res.json({ messages })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/brain/rooms/:id/messages', async (req, res) => {
  const { body, msgtype, intent, payload } = req.body
  if (!body) return res.status(400).json({ error: 'body is required' })
  try {
    const opts = {}
    if (msgtype) opts.msgtype = msgtype
    if (intent !== undefined) opts.intent = intent
    if (payload !== undefined) opts.payload = payload
    const result = await sendRoomMessage(req.params.id, body, opts)
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/brain/messages', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 300
    const before = req.query.before ? parseInt(req.query.before) : null
    const result = await getAllBrainMessages(limit, before)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Skill state & code ──

app.get('/api/skills/:userId/state', async (req, res) => {
  try {
    const roomId = await findSkillRoomId(decodeURIComponent(req.params.userId))
    const state = await getSkillState(roomId)
    res.json(state)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/skills/:userId/state', async (req, res) => {
  try {
    const roomId = await findSkillRoomId(decodeURIComponent(req.params.userId))
    await updateSkillState(roomId, req.body)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/skills/:userId/code', async (req, res) => {
  try {
    const userId = decodeURIComponent(req.params.userId)
    const localpart = userId.replace(/^@/, '').split(':')[0]
    const result = getSkillCode(localpart)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/skills/:userId/code', async (req, res) => {
  const { code } = req.body
  if (typeof code !== 'string') return res.status(400).json({ error: 'code is required' })
  try {
    const userId = decodeURIComponent(req.params.userId)
    const localpart = userId.replace(/^@/, '').split(':')[0]
    saveSkillCode(localpart, code)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/homeserver/rooms', async (_req, res) => {
  const config = readConfig()
  if (config?.homeserver?.type !== 'local') return res.status(400).json({ error: 'Not a local homeserver' })
  try {
    const rooms = await listRooms()
    res.json({ rooms })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/homeserver/rooms', async (req, res) => {
  const config = readConfig()
  if (config?.homeserver?.type !== 'local') return res.status(400).json({ error: 'Not a local homeserver' })
  const { name, topic } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  try {
    const result = await createRoom(name, topic)
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/homeserver/rooms/:id/members', async (req, res) => {
  const config = readConfig()
  if (config?.homeserver?.type !== 'local') return res.status(400).json({ error: 'Not a local homeserver' })
  try {
    const members = await getRoomMembers(req.params.id)
    res.json({ members })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/homeserver/rooms/:id/invite', async (req, res) => {
  const config = readConfig()
  if (config?.homeserver?.type !== 'local') return res.status(400).json({ error: 'Not a local homeserver' })
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId is required' })
  try {
    await inviteToRoom(req.params.id, userId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Registration config (local only) ──

app.get('/api/homeserver/registration-config', async (_req, res) => {
  const config = readConfig()
  if (!config?.homeserver?.url) return res.status(400).json({ error: 'Not configured' })
  try {
    const mode = await getRegistrationMode(config.homeserver.url)
    res.json({ mode })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Set registration mode (local only) — edits tuwunel.toml and restarts
// Modes: closed (no registration), token (registration_token required), open (anyone)
app.post('/api/homeserver/registration-config', async (req, res) => {
  const config = readConfig()
  if (config?.homeserver?.type !== 'local') return res.status(400).json({ error: 'Not a local homeserver' })

  const { mode } = req.body
  if (!['closed', 'token', 'open'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be "closed", "token", or "open"' })
  }

  try {
    await setRegistrationMode(mode, HS_DIR)
    res.json({ success: true, mode })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Brain SSE stream ──

app.get('/api/brain/events', (req, res) => {
  if (!isInitialized()) return res.status(400).json({ error: 'Not initialized' })

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  res.write('event: connected\ndata: {}\n\n')

  addSSEClient(res)
  startSyncLoop()
})

// ── Brain invitations ──

app.get('/api/brain/invitations', async (_req, res) => {
  try {
    const invites = await getPendingInvites()
    res.json({ invitations: invites })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/brain/invitations/:roomId/accept', async (req, res) => {
  try {
    await acceptInvite(req.params.roomId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/brain/invitations/:roomId/reject', async (req, res) => {
  try {
    await rejectInvite(req.params.roomId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Container actions (local homeserver only)
app.post('/api/homeserver/:action', async (req, res) => {
  const config = readConfig()
  if (config?.homeserver?.type !== 'local') {
    return res.status(400).json({ error: 'Not a local homeserver' })
  }
  const { action } = req.params
  try {
    if (action === 'start') {
      await composeUp(HS_DIR)
    } else if (action === 'stop') {
      await composeDown(HS_DIR)
    } else if (action === 'restart') {
      await composeRestart(HS_DIR)
    } else {
      return res.status(400).json({ error: `Unknown action: ${action}` })
    }
    // Wait a moment for containers to settle then return fresh status
    await new Promise((r) => setTimeout(r, 2000))
    const hs = await getContainerStatus('nervur-homeserver')
    const cf = await getContainerStatus('nervur-cloudflared')
    res.json({ success: true, homeserver: hs, cloudflared: cf })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Serve admin UI in production (built files from admin/dist/)
const adminDist = join(__dirname, '..', 'admin', 'dist')
if (existsSync(adminDist)) {
  app.use(express.static(adminDist))
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/health')) {
      res.sendFile(join(adminDist, 'index.html'))
    }
  })
}

export default app
