import { readConfig } from './config.js'

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
    } catch {}
  }

  const res = await fetch(`${hsUrl}/_matrix/client/v3/joined_rooms`, { headers: headers(token) })
  if (!res.ok) throw new Error('Failed to list joined rooms')
  const { joined_rooms: roomIds } = await res.json()

  const conduitBot = `@conduit:${serverName}`

  for (const roomId of (roomIds || [])) {
    try {
      const membersRes = await fetch(
        `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`,
        { headers: headers(token), signal: AbortSignal.timeout(5000) }
      )
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
        } catch {}
      }
    } catch {}
  }

  // Fallback: just use first room with the conduit bot
  for (const roomId of (roomIds || [])) {
    try {
      const membersRes = await fetch(
        `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`,
        { headers: headers(token), signal: AbortSignal.timeout(5000) }
      )
      if (!membersRes.ok) continue
      const data = await membersRes.json()
      if (data.joined && conduitBot in data.joined) {
        adminRoomId = roomId
        return roomId
      }
    } catch {}
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
    await new Promise(r => setTimeout(r, 500))

    const msgRes = await fetch(
      `${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=5`,
      { headers: headers(token) }
    )
    if (!msgRes.ok) continue
    const msgData = await msgRes.json()

    // Find the bot's reply that came after our command
    for (const event of (msgData.chunk || [])) {
      if (event.sender === conduitBot &&
          event.type === 'm.room.message' &&
          event.event_id !== latestEventId &&
          event.origin_server_ts > 0) {
        // Make sure this event is newer than our sent command
        const sentEvent = msgData.chunk.find(e => e.event_id === sentEventId)
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

export async function listUsers() {
  const { brainUserId, serverName } = getAuth()
  const conduitBot = `@conduit:${serverName}`

  // Use admin room command to get ALL local users on the server
  const response = await execAdminCommand('users list-users')
  const lines = parseCodeBlock(response)

  // Each line is a user ID like "@brain:stg.nervur.com"
  const userIds = lines.filter(line => line.startsWith('@'))

  // Filter out the conduit server bot
  const filtered = userIds.filter(id => id !== conduitBot)

  // Fetch display names for all users via profile API
  const { hsUrl, token } = getAuth()
  const users = await Promise.all(filtered.map(async (userId) => {
    let displayname = null
    let avatar_url = null
    try {
      const res = await fetch(
        `${hsUrl}/_matrix/client/v3/profile/${encodeURIComponent(userId)}`,
        { headers: headers(token), signal: AbortSignal.timeout(3000) }
      )
      if (res.ok) {
        const data = await res.json()
        displayname = data.displayname || null
        avatar_url = data.avatar_url || null
      }
    } catch {}
    return {
      name: userId,
      displayname,
      avatar_url,
      admin: userId === brainUserId,
      deactivated: false
    }
  }))

  return users
}

export async function createUser(username, password, displayName) {
  const { hsUrl, serverName } = getAuth()
  const config = readConfig()
  const registrationToken = config?.homeserver?.registrationSecret || config?.onboarding?.registrationSecret

  // Step 1: initiate registration to get session + flows
  const flowRes = await fetch(`${hsUrl}/_matrix/client/v3/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })

  if (flowRes.ok) {
    // Open registration worked directly
    const result = await flowRes.json()
    if (displayName) await setDisplayName(hsUrl, result.access_token, result.user_id, displayName)
    return result
  }

  const flowData = await flowRes.json()

  if (flowData.errcode === 'M_USER_IN_USE') {
    throw new Error(`User @${username}:${serverName} already exists`)
  }

  if (flowRes.status !== 401 || !flowData.session) {
    throw new Error(flowData.error || `Registration failed (HTTP ${flowRes.status})`)
  }

  // Step 2: complete registration with auth
  const stages = (flowData.flows || []).flatMap(f => f.stages || [])
  let auth

  if (registrationToken && stages.includes('m.login.registration_token')) {
    auth = { type: 'm.login.registration_token', token: registrationToken, session: flowData.session }
  } else if (stages.includes('m.login.dummy')) {
    auth = { type: 'm.login.dummy', session: flowData.session }
  } else {
    throw new Error(`Unsupported registration stages: ${stages.join(', ')}`)
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

  const result = await res.json()
  if (displayName) await setDisplayName(hsUrl, result.access_token, result.user_id, displayName)
  return result
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
  // Use admin room command to get ALL rooms the server knows about
  const response = await execAdminCommand('rooms list')
  const lines = parseCodeBlock(response)

  // Each line: "!roomId:server\tMembers: N\tName: RoomName"
  return lines.map(line => {
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
  }).filter(r => r.room_id.startsWith('!'))
}

export async function getRoomMembers(roomId) {
  // Use admin room command for full member list (even rooms brain isn't in)
  const response = await execAdminCommand(`rooms info list-joined-members ${roomId}`)
  const lines = parseCodeBlock(response)

  // Each line: "@user:server | displayname"
  return lines.map(line => {
    const [userId, ...rest] = line.split(' | ')
    const displayname = rest.join(' | ').trim() || userId?.trim()
    return {
      user_id: userId?.trim(),
      displayname
    }
  }).filter(m => m.user_id?.startsWith('@'))
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
    const nameEvent = events.find(e => e.type === 'm.room.name')
    const roomName = nameEvent?.content?.name || null
    const memberEvent = events.find(
      e => e.type === 'm.room.member' && e.content?.membership === 'invite'
    )
    const inviter = memberEvent?.sender || null
    const inviterMemberEvent = events.find(
      e => e.type === 'm.room.member' && e.state_key === inviter
    )
    const inviterDisplayName = inviterMemberEvent?.content?.displayname || null
    const topicEvent = events.find(e => e.type === 'm.room.topic')
    const topic = topicEvent?.content?.topic || null
    const createEvent = events.find(e => e.type === 'm.room.create')
    const creator = createEvent?.content?.creator || createEvent?.sender || null
    const joinRulesEvent = events.find(e => e.type === 'm.room.join_rules')
    const joinRule = joinRulesEvent?.content?.join_rule || null
    const aliasEvent = events.find(e => e.type === 'm.room.canonical_alias')
    const roomAlias = aliasEvent?.content?.alias || null
    const isDirect = memberEvent?.content?.is_direct || false
    const reason = memberEvent?.content?.reason || null
    return { roomId, roomName, inviter, inviterDisplayName, topic, creator, joinRule, roomAlias, isDirect, reason }
  })

  await Promise.all(results.map(async (inv) => {
    if (inv.inviter && !inv.inviterDisplayName) {
      inv.inviterDisplayName = await fetchDisplayName(hsUrl, token, inv.inviter)
    }
  }))

  return results
}

const SYNC_FILTER = JSON.stringify({
  room: {
    timeline: { limit: 0 },
    state: { lazy_load_members: true },
    include_leave: false
  },
  presence: { types: [] },
  account_data: { types: [] }
})

export async function getPendingInvites() {
  const { hsUrl, token } = getAuth()
  const res = await fetch(
    `${hsUrl}/_matrix/client/v3/sync?filter=${encodeURIComponent(SYNC_FILTER)}&timeout=0`,
    { headers: headers(token), signal: AbortSignal.timeout(15_000) }
  )
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

export function addSSEClient(res) {
  sseClients.add(res)
  res.on('close', () => sseClients.delete(res))
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
        await new Promise(r => setTimeout(r, 5000))
        continue
      }
      const data = await res.json()
      syncSince = data.next_batch

      // Check for invite changes
      const invited = data.rooms?.invite || {}
      const left = data.rooms?.leave || {}
      const joined = data.rooms?.join || {}

      const hasInviteChanges = Object.keys(invited).length > 0
        || Object.keys(left).length > 0
        || Object.keys(joined).length > 0

      if (hasInviteChanges && sseClients.size > 0) {
        const fullInvites = await getPendingInvites()
        broadcast('invitations', { invitations: fullInvites })
      }
    } catch {
      await new Promise(r => setTimeout(r, 5000))
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
