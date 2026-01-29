import { useState, useEffect } from 'react'
import { ButtonSpinner } from '../onboarding/icons.jsx'
import CheckItem from '../onboarding/CheckItem.jsx'
import { ACTIONS } from '../onboarding/machine.js'

export default function BrainStep({ ctx, dispatch, savedConfig }) {
  const { server, path } = ctx

  // Resolve initial registration key: prefer server prop, fall back to saved config
  const initialKey = (() => {
    if (path === 'local' && server.registrationSecret) return server.registrationSecret
    const ob = savedConfig?.onboarding
    if (!ob?.identity) return ''
    const isLocal = ob.path === 'local'
    return (isLocal ? ob.server?.registrationSecret : ob.identity?.registrationKey) || ''
  })()

  const [brainName, setBrainName] = useState(() => savedConfig?.onboarding?.identity?.name || '')
  const [username, setUsername] = useState(() => savedConfig?.onboarding?.identity?.username || 'brain')
  const [registrationKey, setRegistrationKey] = useState(initialKey)
  const [keyMode, setKeyMode] = useState(initialKey ? 'paste' : 'generate')

  const [creating, setCreating] = useState(false)
  const [checks, setChecks] = useState([])
  const [createError, setCreateError] = useState(null)

  // Auto-generate key on mount if not already set
  useEffect(() => {
    if (keyMode === 'generate' && !registrationKey) {
      fetch('/api/onboarding/generate-key', { method: 'POST' })
        .then((r) => r.json())
        .then((data) => setRegistrationKey(data.key || ''))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function generateKey() {
    const res = await fetch('/api/onboarding/generate-key', { method: 'POST' })
    const data = await res.json()
    setRegistrationKey(data.key || '')
  }

  const [copied, setCopied] = useState(false)
  function copyKey() {
    navigator.clipboard.writeText(registrationKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function createBrain() {
    setCreating(true)
    setCreateError(null)
    setChecks([])

    // Save identity progress
    await fetch('/api/onboarding/save-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: brainName, username, registrationKey })
    })

    // Run preflight checks
    try {
      const pfRes = await fetch('/api/onboarding/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: server.url })
      })
      const pfData = await pfRes.json()
      setChecks(pfData.checks)

      if (!pfData.allPassed) {
        setCreating(false)
        return
      }
    } catch (err) {
      setChecks([{ id: 'preflight', label: 'Preflight checks', status: 'fail', message: err.message }])
      setCreating(false)
      return
    }

    // All preflight passed — register the brain
    setChecks((prev) => [
      ...prev,
      {
        id: 'register',
        label: 'Brain registration',
        status: 'checking',
        message: 'Creating identity on the homeserver...'
      }
    ])

    try {
      const res = await fetch('/api/onboarding/init-brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: server.url,
          serverName: server.serverName,
          name: brainName,
          username,
          registrationKey,
          type: path === 'local' ? 'local' : 'remote'
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'register' ? { ...c, status: 'pass', message: `Registered as ${data.brain.user_id}` } : c
        )
      )
      setTimeout(() => dispatch({ type: ACTIONS.BRAIN_CREATED, brain: data.brain }), 800)
    } catch (err) {
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'register'
            ? {
                ...c,
                status: 'fail',
                message: err.message,
                help: 'Check the preflight results and homeserver configuration.'
              }
            : c
        )
      )
      setCreateError(err.message)
      setCreating(false)
    }
  }

  const canCreate = brainName.trim() && username.trim() && (registrationKey || '').trim() && !creating

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Create Brain</h2>
      <p className="text-gray-600 mb-6">Configure and create the brain&apos;s identity on the homeserver.</p>

      <label className="block text-sm font-medium text-gray-700 mb-1">
        Display name <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={brainName}
        onChange={(e) => setBrainName(e.target.value)}
        disabled={creating}
        placeholder="My Brain"
        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-nervur-500 focus:border-transparent mb-4 disabled:bg-gray-50 disabled:text-gray-500"
      />

      <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={creating}
        placeholder="brain"
        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-nervur-500 focus:border-transparent mb-1 disabled:bg-gray-50 disabled:text-gray-500"
      />
      <p className="text-xs text-gray-500 mb-4">
        The Matrix username for the brain. Defaults to <code className="bg-gray-100 px-1 rounded">brain</code>.
      </p>

      <label className="block text-sm font-medium text-gray-700 mb-2">Registration key</label>
      {path === 'local' && initialKey ? (
        <>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg mb-1">
            <p className="font-mono text-sm text-gray-900 break-all">{registrationKey}</p>
          </div>
          <p className="text-xs text-gray-500 mb-6">This is the registration token from your provisioned homeserver.</p>
        </>
      ) : (
        <>
          {keyMode === 'generate' ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="font-mono text-sm text-gray-900 break-all">
                    {registrationKey || <span className="text-gray-400">Generating...</span>}
                  </p>
                </div>
                {registrationKey && (
                  <button
                    onClick={copyKey}
                    className="px-3 py-3 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mb-6">
                <p className="text-xs text-gray-500">
                  Save this key securely. Using the same key + username recreates the same identity on any homeserver.
                </p>
                <button
                  onClick={() => {
                    setKeyMode('paste')
                    setRegistrationKey('')
                  }}
                  disabled={creating}
                  className="text-xs text-nervur-600 hover:text-nervur-700 whitespace-nowrap ml-3 disabled:opacity-50"
                >
                  Use existing key
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                type="text"
                value={registrationKey}
                onChange={(e) => setRegistrationKey(e.target.value)}
                disabled={creating}
                placeholder="Paste your existing registration key"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-nervur-500 focus:border-transparent mb-1 disabled:bg-gray-50 disabled:text-gray-500"
              />
              <div className="flex items-center justify-between mb-6">
                <p className="text-xs text-gray-500">Paste the registration key from your homeserver.</p>
                <button
                  onClick={() => {
                    setKeyMode('generate')
                    setRegistrationKey('')
                    generateKey()
                  }}
                  disabled={creating}
                  className="text-xs text-nervur-600 hover:text-nervur-700 whitespace-nowrap ml-3 disabled:opacity-50"
                >
                  Generate new key
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Preflight + registration checklist */}
      {checks.length > 0 && (
        <div className="mb-6 border border-gray-200 rounded-lg divide-y divide-gray-100 px-4">
          {checks.map((check) => (
            <CheckItem key={check.id} check={check} />
          ))}
        </div>
      )}

      {createError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{createError}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setChecks([])
            setCreateError(null)
            setCreating(false)
            dispatch({ type: ACTIONS.GO_BACK })
          }}
          disabled={creating}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={createBrain}
          disabled={!canCreate}
          className="flex items-center gap-2 px-6 py-3 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 disabled:opacity-50"
        >
          {creating && <ButtonSpinner />}
          {creating ? 'Creating...' : checks.length > 0 ? 'Retry' : 'Create Brain'}
        </button>
      </div>
    </div>
  )
}
