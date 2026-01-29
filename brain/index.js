import app from './app.js'
import { readConfig, updateConfig } from './config.js'
import { deriveBrainPassword } from './homeserver.js'

const PORT = process.env.PORT || 3000

// Validate access token on startup (re-login if expired)
async function validateSession() {
  const config = readConfig()
  if (!config?.homeserver?.url || !config?.brain?.access_token) return

  const { url } = config.homeserver
  const { access_token, username, registrationKey } = config.brain

  try {
    const res = await fetch(`${url}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(10_000)
    })

    if (res.ok) {
      console.log('Session valid')
      return
    }

    if (res.status === 401 && username && registrationKey) {
      console.log('Access token expired, re-logging in...')
      const password = deriveBrainPassword(registrationKey, username)
      const loginRes = await fetch(`${url}/_matrix/client/v3/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'm.login.password',
          identifier: { type: 'm.id.user', user: username },
          password,
          initial_device_display_name: 'Nervur Brain'
        }),
        signal: AbortSignal.timeout(10_000)
      })

      if (loginRes.ok) {
        const data = await loginRes.json()
        updateConfig({ brain: { access_token: data.access_token } })
        console.log('Re-login successful, access token updated')
      } else {
        console.warn('Re-login failed:', loginRes.status)
      }
    }
  } catch (err) {
    // Homeserver may not be up yet — warn but don't fail
    console.warn('Session validation skipped:', err.message)
  }
}

app.listen(PORT, async () => {
  console.log(`Brain listening on port ${PORT}`)
  await validateSession()
})
