import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { readConfig } from './config.js'
import { deriveBrainPassword } from './homeserver.js'
import { composeRestart } from '../homeserver/docker.js'

function getAuth() {
  const config = readConfig()
  const hs = config?.homeserver
  const brain = config?.brain
  if (!hs?.url || !brain?.access_token) throw new Error('Not configured')
  return { hsUrl: hs.url, token: brain.access_token, serverName: hs.serverName, brainUserId: brain.user_id }
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

// ── Registration mode helpers ──

/**
 * Probe the register endpoint to detect current registration mode.
 * @returns {'closed' | 'token' | 'open'}
 */
export async function getRegistrationMode(hsUrl) {
  const r = await fetch(`${hsUrl}/_matrix/client/v3/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })
  const data = await r.json()
  if (data.errcode === 'M_FORBIDDEN') return 'closed'
  if (r.status === 401 && data.flows) {
    const stages = data.flows.flatMap((f) => f.stages || [])
    const hasToken = stages.includes('m.login.registration_token')
    const hasDummy = stages.includes('m.login.dummy')
    return hasDummy && !hasToken ? 'open' : hasToken ? 'token' : 'open'
  }
  return 'open'
}

/**
 * Edit tuwunel.toml to set registration mode and restart the homeserver.
 * @param {'closed' | 'token' | 'open'} mode
 * @param {string} hsDir - path to the homeserver data directory
 */
export async function setRegistrationMode(mode, hsDir) {
  const tomlPath = join(hsDir, 'tuwunel.toml')
  if (!existsSync(tomlPath)) throw new Error('tuwunel.toml not found')

  let toml = readFileSync(tomlPath, 'utf8')

  // Extract existing registration_token value (preserve it so token mode can be re-enabled)
  const tokenMatch = toml.match(/^#?\s*registration_token\s*=\s*"([^"]+)"/m)
  const existingToken = tokenMatch?.[1]

  // Remove existing registration lines (we'll rewrite them)
  toml = toml.replace(/^#?\s*allow_registration\s*=\s*.+\n?/gm, '')
  toml = toml.replace(/^#?\s*registration_token\s*=\s*.+\n?/gm, '')
  toml = toml.replace(
    /^#?\s*yes_i_am_very_very_sure_i_want_an_open_registration_server_prone_to_abuse\s*=\s*.+\n?/gm,
    ''
  )

  // Find insertion point — after database_path line
  const insertAfter = /^database_path\s*=.+$/m
  let regBlock = ''

  if (mode === 'closed') {
    regBlock = 'allow_registration = false'
    if (existingToken) regBlock += `\n# registration_token = "${existingToken}"`
  } else if (mode === 'token') {
    regBlock = 'allow_registration = true'
    if (existingToken) regBlock += `\nregistration_token = "${existingToken}"`
  } else {
    // open
    regBlock = 'allow_registration = true'
    regBlock += '\nyes_i_am_very_very_sure_i_want_an_open_registration_server_prone_to_abuse = true'
    if (existingToken) regBlock += `\n# registration_token = "${existingToken}"`
  }

  toml = toml.replace(insertAfter, (match) => `${match}\n${regBlock}`)
  writeFileSync(tomlPath, toml, 'utf8')

  // Restart homeserver to pick up the new config
  await composeRestart(hsDir)
  await new Promise((r) => setTimeout(r, 2000))
}

// ── Admin Room Command Execution ──
// Tuwunel has no REST admin API. All server admin operations go through
// the admin room: send `!admin <command>` as a message, then read the
// @conduit bot's reply from the timeline.

let adminRoomId = null

async function findAdminRoom(hsUrl, token, serverName) {
  if (adminRoomId) return adminRoomId

  // Use stored Tuwunel admin room ID from config
  const config = readConfig()
  const storedId = config?.homeserver?.tuwunel_admin_room_id
  if (storedId) {
    // Verify the conduit bot is in this room
    try {
      const membersRes = await fetch(
        `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(storedId)}/joined_members`,
        { headers: headers(token), signal: AbortSignal.timeout(5000) }
      )
      if (membersRes.ok) {
        const data = await membersRes.json()
        if (data.joined && `@conduit:${serverName}` in data.joined) {
          adminRoomId = storedId
          return storedId
        }
      }
    } catch {
      /* ignore */
    }
  }

  const res = await fetch(`${hsUrl}/_matrix/client/v3/joined_rooms`, { headers: headers(token) })
  if (!res.ok) throw new Error('Failed to list joined rooms')
  const { joined_rooms: roomIds } = await res.json()

  const conduitBot = `@conduit:${serverName}`

  for (const roomId of roomIds || []) {
    try {
      const membersRes = await fetch(`${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`, {
        headers: headers(token),
        signal: AbortSignal.timeout(5000)
      })
      if (!membersRes.ok) continue
      const data = await membersRes.json()
      if (data.joined && conduitBot in data.joined) {
        // Check if this room has "Admin Room" in its name
        try {
          const nameRes = await fetch(
            `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name/`,
            { headers: headers(token), signal: AbortSignal.timeout(3000) }
          )
          if (nameRes.ok) {
            const nameData = await nameRes.json()
            if (nameData.name && nameData.name.includes('Admin Room')) {
              adminRoomId = roomId
              return roomId
            }
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Fallback: just use first room with the conduit bot
  for (const roomId of roomIds || []) {
    try {
      const membersRes = await fetch(`${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`, {
        headers: headers(token),
        signal: AbortSignal.timeout(5000)
      })
      if (!membersRes.ok) continue
      const data = await membersRes.json()
      if (data.joined && conduitBot in data.joined) {
        adminRoomId = roomId
        return roomId
      }
    } catch {
      /* ignore */
    }
  }

  // Last resort: create a DM with @conduit — it responds to !admin commands in any room
  const dmRoomId = await createConduitDM(hsUrl, token, conduitBot)
  adminRoomId = dmRoomId
  return dmRoomId
}

async function createConduitDM(hsUrl, token, conduitBot) {
  const res = await fetch(`${hsUrl}/_matrix/client/v3/createRoom`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      preset: 'trusted_private_chat',
      is_direct: true,
      invite: [conduitBot]
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Failed to create admin DM with ${conduitBot}: ${err.error || res.status}`)
  }
  const { room_id } = await res.json()
  return room_id
}

/**
 * Send a command to the Tuwunel admin room and return the bot's response.
 * @param {string} command - The command without the `!admin` prefix (e.g. "users list-users")
 * @returns {string} The bot's response body text
 */
export async function execAdminCommand(command) {
  const { hsUrl, token, serverName } = getAuth()
  const roomId = await findAdminRoom(hsUrl, token, serverName)
  const conduitBot = `@conduit:${serverName}`

  // Get the current latest event so we know where to look for the reply
  const beforeRes = await fetch(
    `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=1`,
    { headers: headers(token) }
  )
  let latestEventId = null
  if (beforeRes.ok) {
    const beforeData = await beforeRes.json()
    if (beforeData.chunk?.[0]) latestEventId = beforeData.chunk[0].event_id
  }

  // Send the command
  const txnId = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const sendRes = await fetch(
    `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify({ msgtype: 'm.text', body: `!admin ${command}` })
    }
  )
  if (!sendRes.ok) {
    const err = await sendRes.json().catch(() => ({}))
    throw new Error(err.error || `Failed to send admin command (HTTP ${sendRes.status})`)
  }
  const { event_id: sentEventId } = await sendRes.json()

  // Poll for the bot's reply (max ~5 seconds)
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 500))

    const msgRes = await fetch(
      `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=5`,
      { headers: headers(token) }
    )
    if (!msgRes.ok) continue
    const msgData = await msgRes.json()

    // Find the bot's reply that came after our command
    for (const event of msgData.chunk || []) {
      if (
        event.sender === conduitBot &&
        event.type === 'm.room.message' &&
        event.event_id !== latestEventId &&
        event.origin_server_ts > 0
      ) {
        // Make sure this event is newer than our sent command
        const sentEvent = msgData.chunk.find((e) => e.event_id === sentEventId)
        if (sentEvent && event.origin_server_ts >= sentEvent.origin_server_ts) {
          return event.content?.body || ''
        }
        // If we can't find our sent event in the batch, check by position
        // (bot reply should be more recent than our command)
        if (!sentEvent) {
          return event.content?.body || ''
        }
      }
    }
  }

  throw new Error(`Admin command timed out: !admin ${command}`)
}

// ── Parse helpers for admin room responses ──

/**
 * Parse code block content from admin response.
 * Responses use: "Header text:\n```\nline1\nline2\n```"
 */
function parseCodeBlock(response) {
  const match = response.match(/```\n([\s\S]*?)```/)
  if (!match) return []
  return match[1].trim().split('\n').filter(Boolean)
}

// ── Users (server admin context) ──

/**
 * Scan all rooms for com.nervur.room state to classify brains and test users.
 * Returns { brains: Map<userId, { roomId, name }>, testUsers: Map<userId, { roomId, brainUserId }> }
 */
async function classifyUsers() {
  const { hsUrl, token } = getAuth()

  // Get all rooms on the server via admin bot
  const roomsResponse = await execAdminCommand('rooms list')
  const roomLines = parseCodeBlock(roomsResponse)
  const roomIds = roomLines.map((l) => l.split('\t')[0]?.trim()).filter((id) => id?.startsWith('!'))

  const brains = new Map()
  const testUsers = new Map()
  const humanUsers = new Map()
  const skillUsers = new Map()

  // Check each room's m.room.create event for our custom type, then read
  // com.nervur.room state for the brain_user_id. Both are readable without
  // room membership thanks to world_readable history visibility.
  const nervurTypes = ['com.nervur.brain_admin', 'com.nervur.test_user', 'com.nervur.human_user', 'com.nervur.skill_user']
  await Promise.all(
    roomIds.map(async (roomId) => {
      try {
        const res = await fetch(`${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.create/`, {
          headers: headers(token),
          signal: AbortSignal.timeout(3000)
        })
        if (!res.ok) return
        const createEvent = await res.json()
        const roomType = createEvent.type
        if (!nervurTypes.includes(roomType)) return

        // Read brain_user_id from com.nervur.room state (creator field was removed in room v11)
        const stateRes = await fetch(
          `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/com.nervur.room/`,
          { headers: headers(token), signal: AbortSignal.timeout(3000) }
        )
        if (!stateRes.ok) return
        const nervurRoom = await stateRes.json()
        const brainUserId = nervurRoom.brain_user_id
        if (!brainUserId) return

        if (roomType === 'com.nervur.brain_admin') {
          brains.set(brainUserId, { roomId })
        } else if (roomType === 'com.nervur.test_user' || roomType === 'com.nervur.human_user' || roomType === 'com.nervur.skill_user') {
          try {
            const membersRes = await fetch(
              `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`,
              { headers: headers(token), signal: AbortSignal.timeout(5000) }
            )
            if (membersRes.ok) {
              const membersData = await membersRes.json()
              for (const userId of Object.keys(membersData.joined || {})) {
                if (userId !== brainUserId) {
                  if (roomType === 'com.nervur.test_user') {
                    testUsers.set(userId, { roomId, brainUserId })
                  } else if (roomType === 'com.nervur.skill_user') {
                    // Fetch skillType from com.nervur.skill state
                    let skillType = 'internal'
                    try {
                      const skillStateRes = await fetch(
                        `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/com.nervur.skill/`,
                        { headers: headers(token), signal: AbortSignal.timeout(3000) }
                      )
                      if (skillStateRes.ok) {
                        const skillState = await skillStateRes.json()
                        skillType = skillState.skillType || 'internal'
                      }
                    } catch { /* ignore */ }
                    skillUsers.set(userId, { roomId, brainUserId, skillType })
                  } else {
                    humanUsers.set(userId, { roomId, brainUserId })
                  }
                }
              }
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    })
  )

  return { brains, testUsers, humanUsers, skillUsers }
}

export async function listUsers() {
  const { brainUserId, serverName } = getAuth()
  const conduitBot = `@conduit:${serverName}`

  // Use admin room command to get ALL local users on the server
  const response = await execAdminCommand('users list-users')
  const lines = parseCodeBlock(response)

  // Each line is a user ID like "@brain:stg.nervur.com"
  const userIds = lines.filter((line) => line.startsWith('@'))

  // Filter out the conduit server bot
  const filtered = userIds.filter((id) => id !== conduitBot)

  // Classify users by scanning room state
  const { brains, testUsers, humanUsers, skillUsers } = await classifyUsers()

  // Build set of all users who share any room with brain
  const { hsUrl, token } = getAuth()
  const brainRoommates = new Set()
  try {
    const joinedRes = await fetch(`${hsUrl}/_matrix/client/v3/joined_rooms`, { headers: headers(token) })
    if (joinedRes.ok) {
      const { joined_rooms } = await joinedRes.json()
      await Promise.all(
        (joined_rooms || []).map(async (roomId) => {
          try {
            const membersRes = await fetch(
              `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`,
              { headers: headers(token), signal: AbortSignal.timeout(5000) }
            )
            if (membersRes.ok) {
              const data = await membersRes.json()
              for (const uid of Object.keys(data.joined || {})) {
                if (uid !== brainUserId) brainRoommates.add(uid)
              }
            }
          } catch {
            /* ignore */
          }
        })
      )
    }
  } catch {
    /* ignore */
  }

  // Fetch display names for all users via profile API
  const users = await Promise.all(
    filtered.map(async (userId) => {
      let displayname = null
      let avatar_url = null
      try {
        const res = await fetch(`${hsUrl}/_matrix/client/v3/profile/${encodeURIComponent(userId)}`, {
          headers: headers(token),
          signal: AbortSignal.timeout(3000)
        })
        if (res.ok) {
          const data = await res.json()
          displayname = data.displayname || null
          avatar_url = data.avatar_url || null
        }
      } catch {
        /* ignore */
      }

      const brainInfo = brains.get(userId)
      const testInfo = testUsers.get(userId)
      const humanInfo = humanUsers.get(userId)
      const skillInfo = skillUsers.get(userId)
      const role = brainInfo ? 'brain' : testInfo ? 'test' : skillInfo ? 'skill' : 'human'
      const linkedToBrain = !!(testInfo || humanInfo || skillInfo || brainRoommates.has(userId))

      return {
        name: userId,
        displayname,
        avatar_url,
        admin: userId === brainUserId,
        deactivated: false,
        role,
        linkedToBrain,
        ...(brainInfo && { brainRoomId: brainInfo.roomId }),
        ...(testInfo && { brainUserId: testInfo.brainUserId, roomId: testInfo.roomId }),
        ...(humanInfo && { brainUserId: humanInfo.brainUserId, roomId: humanInfo.roomId }),
        ...(skillInfo && { brainUserId: skillInfo.brainUserId, roomId: skillInfo.roomId, skillType: skillInfo.skillType }),
        ...(userId === brainUserId && { isSelf: true })
      }
    })
  )

  return users
}

export async function createUser(username, password, displayName, isTest = false, isSkill = false, skillType = null) {
  const { hsUrl, serverName, token: brainToken, brainUserId } = getAuth()
  const config = readConfig()
  const hsDir = join(process.env.DATA_DIR || join(process.cwd(), 'data'), 'homeserver')
  let registrationToken =
    config?.homeserver?.registrationSecret ||
    config?.onboarding?.server?.registrationSecret ||
    config?.onboarding?.registrationSecret

  // Fallback: read token directly from tuwunel.toml
  if (!registrationToken) {
    const tomlPath = join(hsDir, 'tuwunel.toml')
    if (existsSync(tomlPath)) {
      const toml = readFileSync(tomlPath, 'utf8')
      const match =
        toml.match(/^registration_token\s*=\s*"([^"]+)"/m) || toml.match(/^#\s*registration_token\s*=\s*"([^"]+)"/m)
      if (match) registrationToken = match[1]
    }
  }

  // For test/skill users, derive password from brain's registration key
  if (isTest || isSkill) {
    const registrationKey = config?.brain?.registrationKey
    if (!registrationKey) throw new Error('Brain registration key not found — cannot create user')
    password = deriveBrainPassword(registrationKey, username)
  }

  // Detect registration mode and handle accordingly
  let mode = await getRegistrationMode(hsUrl)
  let reopened = false

  if (mode === 'closed') {
    // Temporarily enable token-based registration
    await setRegistrationMode('token', hsDir)
    mode = 'token'
    reopened = true
  }

  try {
    const result = await doRegister(hsUrl, username, password, mode, registrationToken, serverName)
    if (displayName) await setDisplayName(hsUrl, result.access_token, result.user_id, displayName)

    // Create a room with brain + new user so classifyUsers can link them
    try {
      const newUserId = result.user_id
      const roomType = isTest ? 'com.nervur.test_user' : isSkill ? 'com.nervur.skill_user' : 'com.nervur.human_user'
      const nervurType = isTest ? 'test_user' : isSkill ? 'skill_user' : 'human_user'
      const roomName = isTest ? `Test: ${displayName || username}` : isSkill ? `Skill: ${displayName || username}` : `User: ${displayName || username}`
      const createRoomRes = await fetch(`${hsUrl}/_matrix/client/v3/createRoom`, {
        method: 'POST',
        headers: headers(brainToken),
        body: JSON.stringify({
          preset: 'private_chat',
          name: roomName,
          invite: [newUserId],
          creation_content: { type: roomType },
          initial_state: [
            {
              type: 'm.room.history_visibility',
              state_key: '',
              content: { history_visibility: 'world_readable' }
            },
            {
              type: 'com.nervur.room',
              state_key: '',
              content: {
                type: nervurType,
                brain_user_id: brainUserId,
                test: isTest,
                skill: isSkill
              }
            },
            ...(isSkill
              ? [
                  {
                    type: 'com.nervur.skill',
                    state_key: '',
                    content: {
                      skillType: skillType || 'internal',
                      userId: `@${username}:${serverName}`
                    }
                  }
                ]
              : [])
          ]
        })
      })
      if (!createRoomRes.ok) {
        const err = await createRoomRes.json().catch(() => ({}))
        console.error('User room creation failed:', err.error || createRoomRes.status)
      } else {
        const roomData = await createRoomRes.json()
        // Accept the invite as the new user so both are joined members
        await fetch(`${hsUrl}/_matrix/client/v3/join/${encodeURIComponent(roomData.room_id)}`, {
          method: 'POST',
          headers: headers(result.access_token),
          body: JSON.stringify({})
        })
      }
    } catch (err) {
      console.error('User room setup error:', err.message)
    }

    // Create skill directory + template for internal skills
    if (isSkill && skillType === 'internal') {
      try {
        const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data')
        const skillDir = join(dataDir, 'skills', username)
        mkdirSync(skillDir, { recursive: true })
        const templatePath = join(skillDir, 'index.js')
        if (!existsSync(templatePath)) {
          writeFileSync(templatePath, `export default function(nervur) {
  nervur.on('message', async (msg) => {
    // Handle incoming messages
    console.log('Received:', msg.body)
  })
}
`, 'utf8')
        }
      } catch (err) {
        console.error('Skill template creation error:', err.message)
      }
    }

    return result
  } finally {
    if (reopened) {
      await setRegistrationMode('closed', hsDir)
    }
  }
}

async function doRegister(hsUrl, username, password, mode, registrationToken, serverName) {
  // Step 1: initiate registration to get session + flows
  const flowRes = await fetch(`${hsUrl}/_matrix/client/v3/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })

  if (flowRes.ok) {
    return flowRes.json()
  }

  const flowData = await flowRes.json()

  if (flowData.errcode === 'M_USER_IN_USE') {
    throw new Error(`User @${username}:${serverName} already exists`)
  }

  if (flowRes.status !== 401 || !flowData.session) {
    throw new Error(flowData.error || `Registration failed (HTTP ${flowRes.status})`)
  }

  // Step 2: complete registration with appropriate auth type
  let auth
  if (mode === 'token') {
    if (!registrationToken) throw new Error('Registration token required but not configured')
    auth = { type: 'm.login.registration_token', token: registrationToken, session: flowData.session }
  } else {
    auth = { type: 'm.login.dummy', session: flowData.session }
  }

  const res = await fetch(`${hsUrl}/_matrix/client/v3/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, auth })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Registration failed (HTTP ${res.status})`)
  }

  return res.json()
}

async function setDisplayName(hsUrl, accessToken, userId, displayName) {
  try {
    await fetch(`${hsUrl}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`, {
      method: 'PUT',
      headers: headers(accessToken),
      body: JSON.stringify({ displayname: displayName })
    })
  } catch {
    // best-effort
  }
}

export async function deactivateUser(userId) {
  // Extract localpart from full user ID (@username:server -> username)
  const localpart = userId.replace(/^@/, '').split(':')[0]
  const response = await execAdminCommand(`users deactivate ${localpart}`)
  // Check if the response indicates an error
  if (response.toLowerCase().includes('error')) {
    throw new Error(response)
  }
  return { success: true, response }
}

// ── Rooms (server admin context) ──

export async function listRooms() {
  const { hsUrl, token } = getAuth()

  // Use admin room command to get ALL rooms the server knows about
  const response = await execAdminCommand('rooms list')
  const lines = parseCodeBlock(response)

  // Each line: "!roomId:server\tMembers: N\tName: RoomName"
  const allRooms = lines
    .map((line) => {
      const parts = line.split('\t')
      const room_id = parts[0]?.trim() || ''
      const membersMatch = parts[1]?.match(/Members:\s*(\d+)/)
      const nameMatch = parts[2]?.match(/Name:\s*(.+)/)
      return {
        room_id,
        name: nameMatch?.[1]?.trim() || room_id,
        num_joined_members: membersMatch ? parseInt(membersMatch[1], 10) : 0,
        topic: ''
      }
    })
    .filter((r) => r.room_id.startsWith('!'))

  // Only return rooms where the brain is NOT a member
  const brainRoomIds = new Set()
  try {
    const joinedRes = await fetch(`${hsUrl}/_matrix/client/v3/joined_rooms`, { headers: headers(token) })
    if (joinedRes.ok) {
      const { joined_rooms } = await joinedRes.json()
      for (const id of joined_rooms || []) brainRoomIds.add(id)
    }
  } catch {
    /* ignore */
  }

  return allRooms.filter((r) => !brainRoomIds.has(r.room_id))
}

export async function listBrainRooms() {
  const { hsUrl, token, brainUserId } = getAuth()

  // Get rooms the brain is a member of
  const joinedRes = await fetch(`${hsUrl}/_matrix/client/v3/joined_rooms`, { headers: headers(token) })
  if (!joinedRes.ok) throw new Error('Failed to fetch joined rooms')
  const { joined_rooms } = await joinedRes.json()

  // Get room details for each
  const rooms = await Promise.all(
    (joined_rooms || []).map(async (roomId) => {
      try {
        const enc = encodeURIComponent(roomId)

        const [nameRes, membersRes, powerRes] = await Promise.all([
          fetch(`${hsUrl}/_matrix/client/v3/rooms/${enc}/state/m.room.name/`, { headers: headers(token) }),
          fetch(`${hsUrl}/_matrix/client/v3/rooms/${enc}/joined_members`, { headers: headers(token) }),
          fetch(`${hsUrl}/_matrix/client/v3/rooms/${enc}/state/m.room.power_levels/`, { headers: headers(token) })
        ])

        const name = nameRes.ok ? (await nameRes.json()).name : roomId
        const membersData = membersRes.ok ? await membersRes.json() : { joined: {} }
        const allMembers = Object.keys(membersData.joined || {})
        const otherMembers = allMembers.filter((id) => id !== brainUserId)

        // Check if brain is the room owner (highest power level / creator)
        let brainIsOwner = false
        if (powerRes.ok) {
          const powerLevels = await powerRes.json()
          const brainPower = powerLevels.users?.[brainUserId] ?? powerLevels.users_default ?? 0
          brainIsOwner = brainPower >= 100
        }

        return {
          room_id: roomId,
          name,
          num_joined_members: allMembers.length,
          num_other_members: otherMembers.length,
          brainIsOwner,
          topic: ''
        }
      } catch {
        return {
          room_id: roomId,
          name: roomId,
          num_joined_members: 0,
          num_other_members: 0,
          brainIsOwner: false,
          topic: ''
        }
      }
    })
  )

  return rooms
}

export async function getRoomMembers(roomId) {
  // Use admin room command for full member list (even rooms brain isn't in)
  const response = await execAdminCommand(`rooms info list-joined-members ${roomId}`)
  const lines = parseCodeBlock(response)

  // Each line: "@user:server | displayname"
  return lines
    .map((line) => {
      const [userId, ...rest] = line.split(' | ')
      const displayname = rest.join(' | ').trim() || userId?.trim()
      return {
        user_id: userId?.trim(),
        displayname
      }
    })
    .filter((m) => m.user_id?.startsWith('@'))
}

export async function createRoom(name, topic) {
  const { hsUrl, token } = getAuth()
  const body = { name, visibility: 'private' }
  if (topic) body.topic = topic
  const res = await fetch(`${hsUrl}/_matrix/client/v3/createRoom`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function inviteToRoom(roomId, userId) {
  // Use admin force-join-room to add any local user to any room on the server
  // This works regardless of whether brain is in the room
  const localpart = userId.replace(/^@/, '').split(':')[0]
  const response = await execAdminCommand(`users force-join-room ${localpart} ${roomId}`)
  if (response.toLowerCase().includes('error')) {
    throw new Error(response)
  }
  return { success: true }
}

// ── Brain invitations ──

async function fetchDisplayName(hsUrl, token, userId) {
  try {
    const res = await fetch(`${hsUrl}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`, {
      headers: headers(token),
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.displayname || null
  } catch {
    return null
  }
}

async function parseInviteRooms(invited, hsUrl, token) {
  const results = Object.entries(invited).map(([roomId, roomData]) => {
    const events = roomData.invite_state?.events || []
    const nameEvent = events.find((e) => e.type === 'm.room.name')
    const roomName = nameEvent?.content?.name || null
    const memberEvent = events.find((e) => e.type === 'm.room.member' && e.content?.membership === 'invite')
    const inviter = memberEvent?.sender || null
    const inviterMemberEvent = events.find((e) => e.type === 'm.room.member' && e.state_key === inviter)
    const inviterDisplayName = inviterMemberEvent?.content?.displayname || null
    const topicEvent = events.find((e) => e.type === 'm.room.topic')
    const topic = topicEvent?.content?.topic || null
    const createEvent = events.find((e) => e.type === 'm.room.create')
    const creator = createEvent?.content?.creator || createEvent?.sender || null
    const joinRulesEvent = events.find((e) => e.type === 'm.room.join_rules')
    const joinRule = joinRulesEvent?.content?.join_rule || null
    const aliasEvent = events.find((e) => e.type === 'm.room.canonical_alias')
    const roomAlias = aliasEvent?.content?.alias || null
    const isDirect = memberEvent?.content?.is_direct || false
    const reason = memberEvent?.content?.reason || null
    return { roomId, roomName, inviter, inviterDisplayName, topic, creator, joinRule, roomAlias, isDirect, reason }
  })

  await Promise.all(
    results.map(async (inv) => {
      if (inv.inviter && !inv.inviterDisplayName) {
        inv.inviterDisplayName = await fetchDisplayName(hsUrl, token, inv.inviter)
      }
    })
  )

  return results
}

const SYNC_FILTER = JSON.stringify({
  room: {
    timeline: { limit: 5, types: ['m.room.message'] },
    state: { lazy_load_members: true },
    include_leave: false
  },
  presence: { types: [] },
  account_data: { types: [] }
})

export async function getPendingInvites() {
  const { hsUrl, token } = getAuth()
  const res = await fetch(`${hsUrl}/_matrix/client/v3/sync?filter=${encodeURIComponent(SYNC_FILTER)}&timeout=0`, {
    headers: headers(token),
    signal: AbortSignal.timeout(15_000)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return parseInviteRooms(data.rooms?.invite || {}, hsUrl, token)
}

// ── SSE sync loop ──
// Long-polls Matrix /sync and emits invitation changes to SSE listeners

const sseClients = new Set()
const syncMessageCallbacks = []

export function addSSEClient(res) {
  sseClients.add(res)
  res.on('close', () => sseClients.delete(res))
}

/**
 * Register a callback that fires for every new message from /sync.
 * Callback receives (message) where message has: id, sender, body, msgtype, timestamp, roomId, roomName, fromBrain
 */
export function onSyncMessage(callback) {
  syncMessageCallbacks.push(callback)
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    client.write(msg)
  }
}

let syncRunning = false
let syncSince = null

export function startSyncLoop() {
  if (syncRunning) return
  syncRunning = true
  runSyncLoop()
}

async function runSyncLoop() {
  while (syncRunning) {
    try {
      const { hsUrl, token } = getAuth()
      const params = new URLSearchParams({
        filter: SYNC_FILTER,
        timeout: '30000'
      })
      if (syncSince) params.set('since', syncSince)

      const res = await fetch(`${hsUrl}/_matrix/client/v3/sync?${params}`, {
        headers: headers(token),
        signal: AbortSignal.timeout(60_000)
      })
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 5000))
        continue
      }
      const data = await res.json()
      syncSince = data.next_batch

      // Check for invite changes
      const invited = data.rooms?.invite || {}
      const left = data.rooms?.leave || {}
      const joined = data.rooms?.join || {}

      const hasInviteChanges =
        Object.keys(invited).length > 0 || Object.keys(left).length > 0 || Object.keys(joined).length > 0

      if (hasInviteChanges && sseClients.size > 0) {
        const fullInvites = await getPendingInvites()
        broadcast('invitations', { invitations: fullInvites })
      }

      // Process new messages from joined rooms (always, not just when SSE clients exist)
      const { brainUserId, serverName } = getAuth()
      const config = readConfig()
      const conduitBot = `@conduit:${serverName}`
      const skipRooms = new Set()
      if (config?.homeserver?.tuwunel_admin_room_id) skipRooms.add(config.homeserver.tuwunel_admin_room_id)
      if (config?.brain?.admin_room_id) skipRooms.add(config.brain.admin_room_id)

      const newMessages = []

      for (const [roomId, roomData] of Object.entries(joined)) {
        if (skipRooms.has(roomId)) continue

        const events = roomData.timeline?.events || []
        const msgEvents = events.filter((e) => e.type === 'm.room.message' && e.sender !== conduitBot)
        if (msgEvents.length === 0) continue

        // Get room name (best-effort from state in sync response)
        let roomName = roomId
        const nameEvent = (roomData.state?.events || []).find((e) => e.type === 'm.room.name')
        if (nameEvent?.content?.name) roomName = nameEvent.content.name

        for (const e of msgEvents) {
          newMessages.push({
            id: e.event_id,
            sender: e.sender,
            body: e.content?.body || '',
            msgtype: e.content?.msgtype || 'm.text',
            ...(e.content?.intent !== undefined && { intent: e.content.intent }),
            ...(e.content?.payload !== undefined && { payload: e.content.payload }),
            timestamp: e.origin_server_ts,
            roomId,
            roomName,
            fromBrain: e.sender === brainUserId
          })
        }
      }

      if (newMessages.length > 0) {
        // Broadcast to SSE clients (admin UI)
        if (sseClients.size > 0) {
          broadcast('messages', { messages: newMessages })
        }

        // Notify registered callbacks (router, etc.)
        for (const msg of newMessages) {
          for (const cb of syncMessageCallbacks) {
            try { cb(msg) } catch (err) { console.error('syncMessage callback error:', err.message) }
          }
        }
      }
    } catch {
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}

export async function acceptInvite(roomId) {
  const { hsUrl, token } = getAuth()
  const res = await fetch(`${hsUrl}/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({})
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function rejectInvite(roomId) {
  const { hsUrl, token } = getAuth()
  const res = await fetch(`${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({})
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── All brain messages (cross-room) ──

/**
 * Fetch brain messages across all rooms, paginated.
 * @param {number} limit - max messages to return (one chunk, e.g. 300)
 * @param {number|null} before - only return messages older than this timestamp (ms). null = most recent.
 * @returns {{ messages: Array, hasMore: boolean }}
 */
export async function getAllBrainMessages(limit = 300, before = null) {
  const { hsUrl, token, brainUserId, serverName } = getAuth()
  const config = readConfig()
  const conduitBot = `@conduit:${serverName}`

  // Rooms to skip: admin room, brain admin room
  const skipRooms = new Set()
  if (config?.homeserver?.tuwunel_admin_room_id) skipRooms.add(config.homeserver.tuwunel_admin_room_id)
  if (config?.brain?.admin_room_id) skipRooms.add(config.brain.admin_room_id)

  // Get brain's joined rooms
  const joinedRes = await fetch(`${hsUrl}/_matrix/client/v3/joined_rooms`, { headers: headers(token) })
  if (!joinedRes.ok) throw new Error('Failed to fetch joined rooms')
  const { joined_rooms } = await joinedRes.json()

  const rooms = (joined_rooms || []).filter((roomId) => !skipRooms.has(roomId))
  // Fetch enough per room to fill the chunk — overfetch slightly, then trim
  const perRoomLimit = Math.min(Math.ceil((limit * 1.5) / Math.max(rooms.length, 1)), 100)

  // For each room, fetch name + recent messages in parallel
  const perRoom = await Promise.all(
    rooms.map(async (roomId) => {
      try {
        const enc = encodeURIComponent(roomId)
        const [nameRes, msgRes] = await Promise.all([
          fetch(`${hsUrl}/_matrix/client/v3/rooms/${enc}/state/m.room.name/`, {
            headers: headers(token),
            signal: AbortSignal.timeout(5000)
          }),
          fetch(`${hsUrl}/_matrix/client/v3/rooms/${enc}/messages?dir=b&limit=${perRoomLimit}`, {
            headers: headers(token),
            signal: AbortSignal.timeout(10000)
          })
        ])

        const roomName = nameRes.ok ? (await nameRes.json()).name : roomId
        if (!msgRes.ok) return []

        const data = await msgRes.json()
        return (data.chunk || [])
          .filter((e) => e.type === 'm.room.message' && e.sender !== conduitBot)
          .map((e) => ({
            id: e.event_id,
            sender: e.sender,
            body: e.content?.body || '',
            msgtype: e.content?.msgtype || 'm.text',
            ...(e.content?.intent !== undefined && { intent: e.content.intent }),
            ...(e.content?.payload !== undefined && { payload: e.content.payload }),
            timestamp: e.origin_server_ts,
            roomId,
            roomName,
            fromBrain: e.sender === brainUserId
          }))
      } catch {
        return []
      }
    })
  )

  let all = perRoom.flat()

  // If paginating, only keep messages strictly before the cursor
  if (before != null) {
    all = all.filter((m) => m.timestamp < before)
  }

  // Sort descending (newest first), take `limit + 1` to check hasMore
  all.sort((a, b) => b.timestamp - a.timestamp)
  const hasMore = all.length > limit
  const chunk = all.slice(0, limit)

  // Return in ascending order (oldest first) for display
  chunk.reverse()
  return { messages: chunk, hasMore }
}

// ── Room messages ──

export async function getRoomMessages(roomId, limit = 50) {
  const { hsUrl, token } = getAuth()
  const res = await fetch(
    `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=${limit}`,
    { headers: headers(token) }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return (data.chunk || [])
    .filter((e) => e.type === 'm.room.message')
    .map((e) => ({
      id: e.event_id,
      sender: e.sender,
      body: e.content?.body || '',
      msgtype: e.content?.msgtype || 'm.text',
      ...(e.content?.intent !== undefined && { intent: e.content.intent }),
      ...(e.content?.payload !== undefined && { payload: e.content.payload }),
      timestamp: e.origin_server_ts
    }))
    .reverse()
}

export async function sendRoomMessage(roomId, body, { msgtype = 'm.text', intent, payload } = {}) {
  const { hsUrl, token } = getAuth()
  const txnId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const content = { msgtype, body }
  if (intent !== undefined) content.intent = intent
  if (payload !== undefined) content.payload = payload
  const res = await fetch(
    `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify(content)
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// Cache test user tokens so we don't login on every message
const userTokenCache = new Map()

/**
 * Send a message to a room as a specific user (not the brain).
 * Logs in as the user using their derived password, then sends the message.
 */
export async function sendRoomMessageAs(userId, roomId, body, { msgtype = 'm.text' } = {}) {
  const { hsUrl } = getAuth()
  const config = readConfig()
  const registrationKey = config?.brain?.registrationKey
  if (!registrationKey) throw new Error('Brain registration key not found')

  // Get or create token for this user
  let userToken = userTokenCache.get(userId)
  if (!userToken) {
    const localpart = userId.replace(/^@/, '').split(':')[0]
    const password = deriveBrainPassword(registrationKey, localpart)
    const loginRes = await fetch(`${hsUrl}/_matrix/client/v3/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user: localpart },
        password,
        initial_device_display_name: 'Nervur Admin'
      }),
      signal: AbortSignal.timeout(10_000)
    })
    if (!loginRes.ok) {
      const err = await loginRes.json().catch(() => ({}))
      throw new Error(err.error || `Login failed for ${userId}`)
    }
    const data = await loginRes.json()
    userToken = data.access_token
    userTokenCache.set(userId, userToken)
  }

  const txnId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const res = await fetch(
    `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: headers(userToken),
      body: JSON.stringify({ msgtype, body })
    }
  )
  if (!res.ok) {
    // If token expired, clear cache and retry once
    if (res.status === 401) {
      userTokenCache.delete(userId)
      return sendRoomMessageAs(userId, roomId, body, { msgtype })
    }
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Skill state & code ──

export async function getSkillState(roomId) {
  const { hsUrl, token } = getAuth()
  const res = await fetch(
    `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/com.nervur.skill/`,
    { headers: headers(token), signal: AbortSignal.timeout(5000) }
  )
  if (!res.ok) {
    if (res.status === 404) return {}
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function updateSkillState(roomId, content) {
  const { hsUrl, token } = getAuth()
  // Fetch existing state and merge
  let existing = {}
  try {
    existing = await getSkillState(roomId)
  } catch { /* start fresh */ }
  const merged = { ...existing, ...content }
  const txnId = `state_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const res = await fetch(
    `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/com.nervur.skill/`,
    {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify(merged)
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function getSkillCode(skillName) {
  const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data')
  const filePath = join(dataDir, 'skills', skillName, 'index.js')
  if (!existsSync(filePath)) {
    return { code: '', exists: false }
  }
  return { code: readFileSync(filePath, 'utf8'), exists: true }
}

export function saveSkillCode(skillName, code) {
  const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data')
  const skillDir = join(dataDir, 'skills', skillName)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'index.js'), code, 'utf8')
}

/**
 * Find the roomId for a skill user by their userId.
 * Scans classifyUsers results.
 */
export async function findSkillRoomId(userId) {
  const { skillUsers } = await classifyUsers()
  const info = skillUsers.get(userId)
  if (!info) throw new Error(`Skill room not found for ${userId}`)
  return info.roomId
}
