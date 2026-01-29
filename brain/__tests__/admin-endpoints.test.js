import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, unlinkSync } from 'fs'
import request from 'supertest'
import { getConfigPath, writeConfig } from '../config.js'

// Mock external dependencies before importing app
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

vi.mock('../../homeserver/docker.js', () => ({
  getContainerStatus: vi.fn(),
  composeUp: vi.fn(),
  composeDown: vi.fn(),
  composeRestart: vi.fn(),
  waitForHealthy: vi.fn(),
  getContainerLogs: vi.fn()
}))

vi.mock('../matrix-admin.js', () => ({
  execAdminCommand: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  deactivateUser: vi.fn(),
  listRooms: vi.fn(),
  getRoomMembers: vi.fn(),
  createRoom: vi.fn(),
  inviteToRoom: vi.fn(),
  getPendingInvites: vi.fn(),
  acceptInvite: vi.fn(),
  rejectInvite: vi.fn(),
  addSSEClient: vi.fn(),
  startSyncLoop: vi.fn(),
  getRegistrationMode: vi.fn(),
  setRegistrationMode: vi.fn()
}))

const { verifyHomeserver, registerBrain, findExistingBrainAdminRoom, createBrainAdminRoom } =
  await import('../homeserver.js')
const { getContainerStatus, composeUp, composeDown, composeRestart } = await import('../../homeserver/docker.js')
const {
  listUsers,
  createUser,
  deactivateUser,
  listRooms,
  getRoomMembers,
  createRoom,
  inviteToRoom,
  getPendingInvites,
  acceptInvite,
  rejectInvite,
  getRegistrationMode
} = await import('../matrix-admin.js')
const { default: app } = await import('../app.js')

function writeLocalConfig() {
  writeConfig({
    homeserver: { url: 'http://localhost:8008', serverName: 'nervur.local', type: 'local' },
    brain: { user_id: '@brain:nervur.local', access_token: 'syt_test', name: 'Brain' }
  })
}

function writeRemoteConfig() {
  writeConfig({
    homeserver: { url: 'https://matrix.example.com', serverName: 'example.com', type: 'remote' },
    brain: { user_id: '@brain:example.com', access_token: 'syt_test', name: 'Brain' }
  })
}

afterEach(() => {
  const path = getConfigPath()
  if (existsSync(path)) unlinkSync(path)
  vi.restoreAllMocks()
})

// ── Reset ──

describe('POST /api/onboarding/reset', () => {
  it('wipes config completely when partially initialized', async () => {
    writeConfig({ onboarding: { step: 'server', path: 'local' } })
    const res = await request(app).post('/api/onboarding/reset')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(existsSync(getConfigPath())).toBe(false)
  })

  it('wipes config completely when fully initialized', async () => {
    writeConfig({
      homeserver: { url: 'http://localhost:8008', type: 'local' },
      brain: { access_token: 'syt_test' },
      onboarding: { step: 'network' }
    })

    const res = await request(app).post('/api/onboarding/reset')
    expect(res.status).toBe(200)
    expect(existsSync(getConfigPath())).toBe(false)
  })

  it('handles no config gracefully', async () => {
    const res = await request(app).post('/api/onboarding/reset')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

// ── Homeserver health check ──

describe('GET /api/homeserver/check', () => {
  it('returns ok with server details when healthy', async () => {
    writeLocalConfig()
    verifyHomeserver.mockResolvedValue({ url: 'http://localhost:8008', serverName: 'nervur.local', versions: ['v1.6'] })

    const res = await request(app).get('/api/homeserver/check')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.versions).toContain('v1.6')
  })

  it('returns ok false when unreachable', async () => {
    writeLocalConfig()
    verifyHomeserver.mockRejectedValue(new Error('Connection refused'))

    const res = await request(app).get('/api/homeserver/check')
    expect(res.body.ok).toBe(false)
    expect(res.body.error).toBe('Connection refused')
  })

  it('uses url query param as fallback', async () => {
    verifyHomeserver.mockResolvedValue({ url: 'http://other:8008', versions: ['v1.5'] })

    const res = await request(app).get('/api/homeserver/check?url=http://other:8008')
    expect(res.body.ok).toBe(true)
    expect(verifyHomeserver).toHaveBeenCalledWith('http://other:8008')
  })

  it('returns error when no homeserver configured', async () => {
    const res = await request(app).get('/api/homeserver/check')
    expect(res.body.ok).toBe(false)
    expect(res.body.error).toMatch(/No homeserver/)
  })
})

// ── Container status ──

describe('GET /api/homeserver/status', () => {
  it('returns container status for local homeserver', async () => {
    writeLocalConfig()
    getContainerStatus.mockImplementation(async (name) => ({
      running: name === 'nervur-homeserver',
      status: name === 'nervur-homeserver' ? 'running' : 'not_found'
    }))

    const res = await request(app).get('/api/homeserver/status')
    expect(res.body.available).toBe(true)
    expect(res.body.homeserver.running).toBe(true)
  })

  it('returns not available for remote homeserver', async () => {
    writeRemoteConfig()
    const res = await request(app).get('/api/homeserver/status')
    expect(res.body.available).toBe(false)
  })
})

// ── Container actions ──

describe('POST /api/homeserver/:action', () => {
  beforeEach(() => {
    writeLocalConfig()
    getContainerStatus.mockResolvedValue({ running: true, status: 'running' })
  })

  it('starts containers', async () => {
    composeUp.mockResolvedValue()
    const res = await request(app).post('/api/homeserver/start')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(composeUp).toHaveBeenCalled()
  })

  it('stops containers', async () => {
    composeDown.mockResolvedValue()
    const res = await request(app).post('/api/homeserver/stop')
    expect(res.status).toBe(200)
    expect(composeDown).toHaveBeenCalled()
  })

  it('restarts containers', async () => {
    composeRestart.mockResolvedValue()
    const res = await request(app).post('/api/homeserver/restart')
    expect(res.status).toBe(200)
    expect(composeRestart).toHaveBeenCalled()
  })

  it('rejects unknown actions', async () => {
    const res = await request(app).post('/api/homeserver/explode')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Unknown action/)
  })

  it('rejects for remote homeserver', async () => {
    writeRemoteConfig()
    const res = await request(app).post('/api/homeserver/start')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Not a local/)
  })
})

// ── User management ──

describe('GET /api/homeserver/users', () => {
  it('returns users list for local homeserver', async () => {
    writeLocalConfig()
    listUsers.mockResolvedValue([
      { name: '@alice:nervur.local', displayname: 'Alice', admin: false, deactivated: false },
      { name: '@brain:nervur.local', displayname: 'Brain', admin: true, deactivated: false }
    ])

    const res = await request(app).get('/api/homeserver/users')
    expect(res.status).toBe(200)
    expect(res.body.users).toHaveLength(2)
    expect(res.body.users[0].name).toBe('@alice:nervur.local')
  })

  it('rejects for remote homeserver', async () => {
    writeRemoteConfig()
    const res = await request(app).get('/api/homeserver/users')
    expect(res.status).toBe(400)
  })

  it('returns 500 on listUsers failure', async () => {
    writeLocalConfig()
    listUsers.mockRejectedValue(new Error('Matrix error'))

    const res = await request(app).get('/api/homeserver/users')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Matrix error')
  })
})

describe('POST /api/homeserver/users', () => {
  beforeEach(() => writeLocalConfig())

  it('creates a user', async () => {
    createUser.mockResolvedValue({ user_id: '@alice:nervur.local' })

    const res = await request(app).post('/api/homeserver/users').send({
      username: 'alice',
      password: 'secret123',
      displayName: 'Alice'
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(createUser).toHaveBeenCalledWith('alice', 'secret123', 'Alice', false)
  })

  it('returns 400 without username', async () => {
    const res = await request(app).post('/api/homeserver/users').send({ password: 'secret' })
    expect(res.status).toBe(400)
  })

  it('returns 400 without password', async () => {
    const res = await request(app).post('/api/homeserver/users').send({ username: 'alice' })
    expect(res.status).toBe(400)
  })

  it('returns 500 on createUser failure', async () => {
    createUser.mockRejectedValue(new Error('User exists'))

    const res = await request(app).post('/api/homeserver/users').send({
      username: 'alice',
      password: 'secret'
    })
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('User exists')
  })
})

describe('DELETE /api/homeserver/users/:userId', () => {
  it('deactivates a user', async () => {
    writeLocalConfig()
    deactivateUser.mockResolvedValue()

    const res = await request(app).delete('/api/homeserver/users/%40alice%3Anervur.local')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 500 on deactivateUser failure', async () => {
    writeLocalConfig()
    deactivateUser.mockRejectedValue(new Error('Not supported'))

    const res = await request(app).delete('/api/homeserver/users/%40alice%3Anervur.local')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Not supported')
  })
})

// ── Room management ──

describe('GET /api/homeserver/rooms', () => {
  it('returns rooms list', async () => {
    writeLocalConfig()
    listRooms.mockResolvedValue([{ room_id: '!abc:nervur.local', name: 'General', num_joined_members: 3 }])

    const res = await request(app).get('/api/homeserver/rooms')
    expect(res.status).toBe(200)
    expect(res.body.rooms).toHaveLength(1)
    expect(res.body.rooms[0].name).toBe('General')
  })

  it('rejects for remote homeserver', async () => {
    writeRemoteConfig()
    const res = await request(app).get('/api/homeserver/rooms')
    expect(res.status).toBe(400)
  })
})

describe('POST /api/homeserver/rooms', () => {
  beforeEach(() => writeLocalConfig())

  it('creates a room', async () => {
    createRoom.mockResolvedValue({ room_id: '!new:nervur.local' })

    const res = await request(app).post('/api/homeserver/rooms').send({ name: 'New Room', topic: 'Test' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.room_id).toBe('!new:nervur.local')
  })

  it('returns 400 without name', async () => {
    const res = await request(app).post('/api/homeserver/rooms').send({ topic: 'No name' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/homeserver/rooms/:id/members', () => {
  it('returns room members', async () => {
    writeLocalConfig()
    getRoomMembers.mockResolvedValue([{ user_id: '@alice:nervur.local', displayname: 'Alice' }])

    const res = await request(app).get('/api/homeserver/rooms/%21abc%3Anervur.local/members')
    expect(res.status).toBe(200)
    expect(res.body.members).toHaveLength(1)
    expect(res.body.members[0].displayname).toBe('Alice')
  })
})

describe('POST /api/homeserver/rooms/:id/invite', () => {
  beforeEach(() => writeLocalConfig())

  it('invites a user to a room', async () => {
    inviteToRoom.mockResolvedValue({})

    const res = await request(app)
      .post('/api/homeserver/rooms/%21abc%3Anervur.local/invite')
      .send({ userId: '@alice:nervur.local' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 400 without userId', async () => {
    const res = await request(app).post('/api/homeserver/rooms/%21abc%3Anervur.local/invite').send({})
    expect(res.status).toBe(400)
  })
})

// ── Registration config ──

describe('GET /api/homeserver/registration-config', () => {
  it('returns registration mode token', async () => {
    writeLocalConfig()
    getRegistrationMode.mockResolvedValue('token')

    const res = await request(app).get('/api/homeserver/registration-config')
    expect(res.status).toBe(200)
    expect(res.body.mode).toBe('token')
  })

  it('returns registration mode closed', async () => {
    writeLocalConfig()
    getRegistrationMode.mockResolvedValue('closed')

    const res = await request(app).get('/api/homeserver/registration-config')
    expect(res.status).toBe(200)
    expect(res.body.mode).toBe('closed')
  })

  it('returns 400 when no homeserver configured', async () => {
    const res = await request(app).get('/api/homeserver/registration-config')
    expect(res.status).toBe(400)
  })
})

// ── Brain invitations ──

describe('GET /api/brain/invitations', () => {
  it('returns pending invitations', async () => {
    writeLocalConfig()
    getPendingInvites.mockResolvedValue([{ roomId: '!room:test', roomName: 'Test Room', inviter: '@alice:test' }])

    const res = await request(app).get('/api/brain/invitations')
    expect(res.status).toBe(200)
    expect(res.body.invitations).toHaveLength(1)
    expect(res.body.invitations[0].roomName).toBe('Test Room')
  })

  it('returns 500 on error', async () => {
    writeLocalConfig()
    getPendingInvites.mockRejectedValue(new Error('Sync failed'))

    const res = await request(app).get('/api/brain/invitations')
    expect(res.status).toBe(500)
  })
})

describe('POST /api/brain/invitations/:roomId/accept', () => {
  it('accepts an invitation', async () => {
    writeLocalConfig()
    acceptInvite.mockResolvedValue({})

    const res = await request(app).post('/api/brain/invitations/%21room%3Atest/accept')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(acceptInvite).toHaveBeenCalledWith('!room:test')
  })
})

describe('POST /api/brain/invitations/:roomId/reject', () => {
  it('rejects an invitation', async () => {
    writeLocalConfig()
    rejectInvite.mockResolvedValue({})

    const res = await request(app).post('/api/brain/invitations/%21room%3Atest/reject')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(rejectInvite).toHaveBeenCalledWith('!room:test')
  })

  it('returns 500 on error', async () => {
    writeLocalConfig()
    rejectInvite.mockRejectedValue(new Error('Leave failed'))

    const res = await request(app).post('/api/brain/invitations/%21room%3Atest/reject')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Leave failed')
  })
})

// ── Init brain ──

describe('POST /api/onboarding/init-brain', () => {
  const payload = {
    url: 'https://matrix.example.com',
    serverName: 'example.com',
    name: 'TestBrain',
    username: 'brain',
    registrationKey: 'test-key-123',
    type: 'remote'
  }

  it('creates admin room on fresh registration', async () => {
    registerBrain.mockResolvedValue({
      user_id: '@brain:example.com',
      access_token: 'syt_fresh'
    })
    findExistingBrainAdminRoom.mockResolvedValue(null)
    createBrainAdminRoom.mockResolvedValue('!admin:example.com')

    const res = await request(app).post('/api/onboarding/init-brain').send(payload)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.brain.admin_room_id).toBe('!admin:example.com')
    expect(findExistingBrainAdminRoom).toHaveBeenCalledWith('https://matrix.example.com', 'syt_fresh')
    expect(createBrainAdminRoom).toHaveBeenCalledWith('https://matrix.example.com', 'syt_fresh', {
      brainUserId: '@brain:example.com',
      name: 'TestBrain'
    })
  })

  it('finds existing admin room on login fallback', async () => {
    registerBrain.mockResolvedValue({
      user_id: '@brain:example.com',
      access_token: 'syt_existing'
    })
    findExistingBrainAdminRoom.mockResolvedValue('!existing:example.com')

    const res = await request(app).post('/api/onboarding/init-brain').send(payload)
    expect(res.status).toBe(200)
    expect(res.body.brain.admin_room_id).toBe('!existing:example.com')
    expect(createBrainAdminRoom).not.toHaveBeenCalled()
  })

  it('returns 502 on registration failure', async () => {
    registerBrain.mockRejectedValue(new Error('Registration failed'))

    const res = await request(app).post('/api/onboarding/init-brain').send(payload)
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('Registration failed')
  })
})
