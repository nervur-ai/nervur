import { readConfig } from './config.js'
import { onSyncMessage, sendRoomMessage } from './matrix-admin.js'

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

// roomId → { type: 'test_user' | 'human_user' | 'skill_user', members: string[] }
const roomMap = new Map()

// Skill room IDs discovered at boot
let lmstudioRoomId = null
let queueRoomId = null

/**
 * Build the room type map by reading com.nervur.room state from all brain's joined rooms.
 */
async function buildRoomMap() {
  const { hsUrl, token } = getAuth()

  const joinedRes = await fetch(`${hsUrl}/_matrix/client/v3/joined_rooms`, { headers: headers(token) })
  if (!joinedRes.ok) throw new Error('Failed to fetch joined rooms')
  const { joined_rooms } = await joinedRes.json()

  await Promise.all(
    (joined_rooms || []).map(async (roomId) => {
      try {
        const enc = encodeURIComponent(roomId)

        // Read com.nervur.room state
        const stateRes = await fetch(`${hsUrl}/_matrix/client/v3/rooms/${enc}/state/com.nervur.room/`, {
          headers: headers(token),
          signal: AbortSignal.timeout(5000)
        })
        if (!stateRes.ok) return

        const nervurRoom = await stateRes.json()
        if (!nervurRoom.type) return

        // Get members
        const membersRes = await fetch(`${hsUrl}/_matrix/client/v3/rooms/${enc}/joined_members`, {
          headers: headers(token),
          signal: AbortSignal.timeout(5000)
        })
        const members = membersRes.ok ? Object.keys((await membersRes.json()).joined || {}) : []

        roomMap.set(roomId, { type: nervurRoom.type, members })

        // Detect skill rooms by member userId prefix
        if (nervurRoom.type === 'skill_user') {
          for (const m of members) {
            if (m.startsWith('@lmstudio:')) lmstudioRoomId = roomId
            if (m.startsWith('@queue:')) queueRoomId = roomId
          }
        }
      } catch {
        /* ignore */
      }
    })
  )
}

/**
 * Discover a room's type on the fly and cache it in roomMap.
 */
async function discoverRoom(roomId) {
  try {
    const { hsUrl, token } = getAuth()
    const enc = encodeURIComponent(roomId)

    // Try com.nervur.room state first
    const stateRes = await fetch(`${hsUrl}/_matrix/client/v3/rooms/${enc}/state/com.nervur.room/`, {
      headers: headers(token),
      signal: AbortSignal.timeout(5000)
    })
    if (stateRes.ok) {
      const nervurRoom = await stateRes.json()
      if (nervurRoom.type) {
        const room = { type: nervurRoom.type, members: [] }
        roomMap.set(roomId, room)
        console.log(`Router: discovered room ${roomId} (${room.type})`)
        return room
      }
    }

    // No state — any room with brain as member is treated as human_user
    const room = { type: 'human_user', members: [] }
    roomMap.set(roomId, room)
    console.log(`Router: discovered room ${roomId} (human_user, no state)`)
    return room
  } catch {
    return null
  }
}

/**
 * Start the router: build room map, then listen for sync messages.
 */
export async function startRouter() {
  try {
    await buildRoomMap()
  } catch (err) {
    console.error('Router: failed to build room map:', err.message)
    return
  }

  const missing = []
  if (!lmstudioRoomId) missing.push('lmstudio')
  if (!queueRoomId) missing.push('queue')

  if (missing.length > 0) {
    console.warn(`Router: missing skill rooms: ${missing.join(', ')} — routing disabled`)
    return
  }

  console.log(`Router: lmstudio=${lmstudioRoomId}`)
  console.log(`Router: queue=${queueRoomId}`)
  console.log(`Router: tracking ${roomMap.size} rooms`)

  onSyncMessage(async (msg) => {
    // Skip brain's own messages
    if (msg.fromBrain) return

    let room = roomMap.get(msg.roomId)
    if (!room) {
      // Room not in map — try to discover it on the fly
      room = await discoverRoom(msg.roomId)
      if (!room) return
    }

    // ── Human → Queue: message from a test_user or human_user room ──
    if (room.type === 'test_user' || room.type === 'human_user') {
      console.log(`Router: ${msg.sender} → queue (enqueue): "${msg.body.slice(0, 80)}"`)
      sendRoomMessage(queueRoomId, msg.body, {
        intent: 'enqueue',
        payload: { continuation: { action: 'prompt', roomId: msg.roomId, eventId: msg.id } }
      }).catch((err) => {
        console.error('Router: failed to enqueue:', err.message)
      })
      return
    }

    // ── Queue → skill or human: process dequeued message ──
    if (msg.roomId === queueRoomId && msg.intent === 'process') {
      const continuation = msg.payload?.continuation || {}

      if (continuation.action === 'prompt') {
        console.log(`Router: queue → lmstudio: "${msg.body.slice(0, 80)}"`)
        sendRoomMessage(lmstudioRoomId, msg.body, {
          intent: 'prompt',
          payload: { echo: continuation }
        }).catch((err) => {
          console.error('Router: failed to forward to lmstudio:', err.message)
        })
        return
      }

      if (continuation.action === 'deliver') {
        console.log(`Router: queue → human room: "${msg.body.slice(0, 80)}"`)
        sendRoomMessage(continuation.roomId, msg.body).catch((err) => {
          console.error('Router: failed to deliver to human:', err.message)
        })
        return
      }

      return
    }

    // ── LMStudio → Queue: response comes back with echo ──
    if (msg.roomId === lmstudioRoomId && (msg.intent === 'prompt.response' || msg.intent === 'error')) {
      const echo = msg.payload?.echo || {}
      console.log(`Router: lmstudio → queue (returning): "${msg.body.slice(0, 80)}"`)
      sendRoomMessage(queueRoomId, msg.body, {
        intent: 'enqueue',
        payload: {
          continuation: { action: 'deliver', roomId: echo.roomId, returning: true }
        }
      }).catch((err) => {
        console.error('Router: failed to return to queue:', err.message)
      })
    }
  })
}
