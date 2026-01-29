import crypto from 'crypto'

export async function verifyHomeserver(input) {
  // Normalize: add https:// if no protocol
  let origin = input.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(origin)) origin = `https://${origin}`

  // Try .well-known discovery first
  let hsUrl = origin
  let serverName = new URL(origin).hostname
  try {
    const wk = await fetch(`${origin}/.well-known/matrix/client`)
    if (wk.ok) {
      const data = await wk.json()
      const base = data?.['m.homeserver']?.base_url
      if (base) {
        const resolved = base.replace(/\/+$/, '')
        const resolvedHost = new URL(resolved).hostname
        // Skip .well-known if it crosses the private/public boundary:
        // - public origin → private .well-known (e.g. Cloudflare tunnel returning localhost)
        // - private origin → public .well-known (e.g. localhost returning public domain)
        // In both cases the redirect would break connectivity checks.
        const originPrivate = isPrivateHost(serverName)
        const resolvedPrivate = isPrivateHost(resolvedHost)
        if (originPrivate !== resolvedPrivate) {
          // Keep the original URL — don't cross the boundary
        } else {
          hsUrl = resolved
        }
        serverName = new URL(origin).hostname // server name = what the user typed
      }
    }
  } catch (_e) {
    // .well-known not available — use origin directly
  }

  // Verify the resolved homeserver
  let data
  try {
    const res = await fetch(`${hsUrl}/_matrix/client/versions`, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error()
    data = await res.json()
    if (!data.versions?.length) throw new Error()
  } catch {
    throw new Error('Not a Matrix homeserver')
  }

  // Gather optional extra info in parallel (best-effort)
  const extra = await fetchHomeserverDetails(hsUrl, data)

  return { url: hsUrl, serverName, versions: data.versions, ...extra }
}

async function fetchHomeserverDetails(hsUrl, versionsData) {
  const details = {}

  // Unstable features from the versions response
  if (versionsData.unstable_features) {
    const features = Object.entries(versionsData.unstable_features)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
    if (features.length) details.unstableFeatures = features
  }

  // Server software via federation endpoint (best-effort)
  const [serverInfo, capabilities] = await Promise.all([fetchServerVersion(hsUrl), fetchCapabilities(hsUrl)])
  if (serverInfo) details.server = serverInfo
  if (capabilities) details.capabilities = capabilities

  return details
}

async function fetchServerVersion(hsUrl) {
  try {
    const res = await fetch(`${hsUrl}/_matrix/federation/v1/version`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    if (data.server?.name) return { name: data.server.name, version: data.server.version }
  } catch (_e) {
    // federation endpoint often not on same port — that's fine
  }
  return null
}

async function fetchCapabilities(hsUrl) {
  try {
    const res = await fetch(`${hsUrl}/_matrix/client/v3/capabilities`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    const caps = data.capabilities || {}
    const result = {}
    if (caps['m.room_versions']) {
      result.defaultRoomVersion = caps['m.room_versions'].default
    }
    if (caps['m.change_password']?.enabled !== undefined) {
      result.changePassword = caps['m.change_password'].enabled
    }
    if (caps['m.set_displayname']?.enabled !== undefined) {
      result.setDisplayname = caps['m.set_displayname'].enabled
    }
    if (caps['m.set_avatar_url']?.enabled !== undefined) {
      result.setAvatarUrl = caps['m.set_avatar_url'].enabled
    }
    return Object.keys(result).length ? result : null
  } catch (_e) {
    // capabilities endpoint may not be publicly accessible
  }
  return null
}

function isPrivateHost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname.endsWith('.local')
  )
}

export function getServerName(url) {
  return new URL(url).hostname
}

export function generateRegistrationKey() {
  return crypto.randomBytes(32).toString('base64url')
}

export function deriveBrainPassword(registrationKey, username) {
  return crypto.createHmac('sha256', registrationKey).update(username).digest('base64url')
}

// Preflight checks — each returns { id, label, status, message, help? }
export async function runPreflightChecks(url) {
  const checks = []

  // 1. Reachable
  checks.push(await checkReachable(url))
  if (checks[0].status === 'fail') return checks

  // 2. Client API versions
  checks.push(await checkClientVersions(url))

  // 3. Registration support
  checks.push(await checkRegistration(url))

  // 4. Login flows
  checks.push(await checkLoginFlows(url))

  return checks
}

async function checkReachable(url) {
  try {
    const res = await fetch(`${url}/_matrix/client/versions`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) {
      return {
        id: 'reachable',
        label: 'Homeserver reachable',
        status: 'fail',
        message: `Returned HTTP ${res.status}`,
        help: 'Make sure the homeserver is running and the URL is correct.'
      }
    }
    return { id: 'reachable', label: 'Homeserver reachable', status: 'pass', message: 'Connected successfully' }
  } catch (err) {
    return {
      id: 'reachable',
      label: 'Homeserver reachable',
      status: 'fail',
      message: err.message,
      help: 'Check that the URL is correct and the homeserver is accepting connections.'
    }
  }
}

async function checkClientVersions(url) {
  try {
    const res = await fetch(`${url}/_matrix/client/versions`)
    const data = await res.json()
    const versions = data.versions || []
    const hasModern = versions.some((v) => {
      const match = v.match(/^v(\d+)\.(\d+)$/)
      return match && (parseInt(match[1]) > 1 || (parseInt(match[1]) === 1 && parseInt(match[2]) >= 1))
    })
    if (hasModern) {
      return {
        id: 'client_api',
        label: 'Client API v1.1+',
        status: 'pass',
        message: `Supports ${versions.length} versions (${versions.slice(-2).join(', ')})`
      }
    }
    return {
      id: 'client_api',
      label: 'Client API v1.1+',
      status: 'fail',
      message: `Only supports: ${versions.join(', ')}`,
      help: 'Nervur requires Client-Server API v1.1 or later. Upgrade your homeserver.'
    }
  } catch (err) {
    return {
      id: 'client_api',
      label: 'Client API v1.1+',
      status: 'fail',
      message: err.message
    }
  }
}

async function checkRegistration(url) {
  try {
    const res = await fetch(`${url}/_matrix/client/v3/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    const data = await res.json()

    // 401 with flows = registration is available (needs auth)
    if (res.status === 401 && data.flows) {
      const stages = data.flows.flatMap((f) => f.stages || [])
      if (stages.includes('m.login.registration_token')) {
        return {
          id: 'registration',
          label: 'Token registration available',
          status: 'pass',
          message: 'Supports m.login.registration_token'
        }
      }
      if (stages.includes('m.login.dummy')) {
        return {
          id: 'registration',
          label: 'Open registration available',
          status: 'pass',
          message: 'Open registration enabled (m.login.dummy)'
        }
      }
      return {
        id: 'registration',
        label: 'Registration available',
        status: 'warn',
        message: `Available auth stages: ${stages.join(', ')}`,
        help: 'Enable registration_token support on your homeserver for secure brain registration.'
      }
    }

    if (data.errcode === 'M_FORBIDDEN') {
      return {
        id: 'registration',
        label: 'Registration available',
        status: 'fail',
        message: 'Registration is disabled',
        help: 'Enable registration on the homeserver. For Synapse: set enable_registration to true. For Conduit/Tuwunel: set allow_registration to true.'
      }
    }

    // 200 = open registration worked (unusual but ok)
    if (res.ok) {
      return {
        id: 'registration',
        label: 'Registration available',
        status: 'pass',
        message: 'Open registration'
      }
    }

    return {
      id: 'registration',
      label: 'Registration available',
      status: 'warn',
      message: `Unexpected response: ${data.errcode || res.status}`,
      help: 'Could not determine registration status. Brain init will attempt registration anyway.'
    }
  } catch (err) {
    return {
      id: 'registration',
      label: 'Registration available',
      status: 'fail',
      message: err.message
    }
  }
}

async function checkLoginFlows(url) {
  try {
    const res = await fetch(`${url}/_matrix/client/v3/login`)
    if (!res.ok) {
      return {
        id: 'login',
        label: 'Password login supported',
        status: 'fail',
        message: `HTTP ${res.status}`,
        help: 'The login endpoint is not available. Check homeserver configuration.'
      }
    }
    const data = await res.json()
    const flows = (data.flows || []).map((f) => f.type)
    if (flows.includes('m.login.password')) {
      return {
        id: 'login',
        label: 'Password login supported',
        status: 'pass',
        message: 'Supports m.login.password'
      }
    }
    return {
      id: 'login',
      label: 'Password login supported',
      status: 'fail',
      message: `Available: ${flows.join(', ')}`,
      help: 'Enable password login on your homeserver. The brain uses password authentication to maintain its session.'
    }
  } catch (err) {
    return {
      id: 'login',
      label: 'Password login supported',
      status: 'fail',
      message: err.message
    }
  }
}

export async function registerBrain(url, serverName, { username, registrationKey, type }) {
  const password = deriveBrainPassword(registrationKey, username)

  // For local: use registrationKey as the m.login.registration_token (it matches tuwunel.toml)
  // For remote: registrationKey is only for password derivation; use open registration (m.login.dummy)
  const token = type === 'local' ? registrationKey : null
  const registered = await tryRegister(url, username, password, token)
  if (registered) return registered

  throw new Error('Registration failed: homeserver rejected all registration methods. Check the preflight results.')
}

async function tryRegister(url, username, password, token) {
  // Step 1: get auth flows
  const flowRes = await fetch(`${url}/_matrix/client/v3/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })

  if (flowRes.ok) return flowRes.json()

  const flowData = await flowRes.json()

  // Already exists — login instead (idempotent)
  if (flowData.errcode === 'M_USER_IN_USE') {
    try {
      return await login(url, username, password)
    } catch {
      throw new Error(
        `User @${username} already exists on this homeserver but the registration key doesn't match. ` +
          'Use the same key from the original registration, or choose a different username.'
      )
    }
  }

  if (flowRes.status !== 401 || !flowData.session) return null

  // Step 2: complete auth
  const authTypes = (flowData.flows || []).flatMap((f) => f.stages || [])
  let auth

  if (token && authTypes.includes('m.login.registration_token')) {
    auth = { type: 'm.login.registration_token', token, session: flowData.session }
  } else if (authTypes.includes('m.login.dummy')) {
    auth = { type: 'm.login.dummy', session: flowData.session }
  } else {
    return null
  }

  const res = await fetch(`${url}/_matrix/client/v3/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      auth,
      initial_device_display_name: 'Nervur Brain'
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (err.errcode === 'M_USER_IN_USE') {
      try {
        return await login(url, username, password)
      } catch {
        throw new Error(
          `User @${username} already exists on this homeserver but the registration key doesn't match. ` +
            'Use the same key from the original registration, or choose a different username.'
        )
      }
    }
    return null
  }

  return res.json()
}

export async function findExistingBrainAdminRoom(url, accessToken) {
  const res = await fetch(`${url}/_matrix/client/v3/joined_rooms`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) return null
  const { joined_rooms } = await res.json()

  for (const roomId of joined_rooms) {
    try {
      const stateRes = await fetch(
        `${url}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/com.nervur.room/`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!stateRes.ok) continue
      const content = await stateRes.json()
      if (content.type === 'brain_admin') return roomId
    } catch {
      continue
    }
  }
  return null
}

export async function createBrainAdminRoom(url, accessToken, { brainUserId, name }) {
  const res = await fetch(`${url}/_matrix/client/v3/createRoom`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      preset: 'private_chat',
      name: `${name} Admin`,
      initial_state: [
        {
          type: 'com.nervur.room',
          state_key: '',
          content: {
            type: 'brain_admin',
            brain_user_id: brainUserId,
            name,
            version: '1.0.0'
          }
        }
      ]
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Failed to create brain admin room: ${err.error || res.status}`)
  }
  const data = await res.json()
  return data.room_id
}

export async function joinTuwunelAdminRoom(url, accessToken, serverName) {
  const alias = `#admins:${serverName}`
  const res = await fetch(`${url}/_matrix/client/v3/join/${encodeURIComponent(alias)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })
  if (!res.ok) {
    // Not fatal — might be remote HS where brain isn't admin
    return null
  }
  const data = await res.json()
  return data.room_id
}

async function login(url, username, password) {
  const res = await fetch(`${url}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: username },
      password,
      initial_device_display_name: 'Nervur Brain'
    })
  })
  if (!res.ok) throw new Error(`Login failed (HTTP ${res.status})`)
  return res.json()
}
