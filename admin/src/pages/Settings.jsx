import { useState, useEffect } from 'react'

const Spinner = ({ className = 'w-4 h-4' }) => (
  <svg className={`animate-spin text-nervur-500 ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

const CheckIcon = () => (
  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const ErrorIcon = () => (
  <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

function sortVersions(versions) {
  return [...versions].sort((a, b) => {
    const pa = a.match(/^[vr](\d+)\.(\d+)/)
    const pb = b.match(/^[vr](\d+)\.(\d+)/)
    if (!pa || !pb) return 0
    const prefA = a[0] === 'v' ? 1 : 0
    const prefB = b[0] === 'v' ? 1 : 0
    if (prefA !== prefB) return prefA - prefB
    return (+pa[1] - +pb[1]) || (+pa[2] - +pb[2])
  })
}

export default function Settings({ config }) {
  const hs = config?.homeserver || {}
  const isLocal = hs.type === 'local'
  const hasPublicDomain = !!hs.domain

  const [resetStep, setResetStep] = useState(0)
  const [resetting, setResetting] = useState(false)
  const [factoryStep, setFactoryStep] = useState(0)
  const [factoryResetting, setFactoryResetting] = useState(false)

  // Connectivity checks + server details
  const [localCheck, setLocalCheck] = useState({ status: null, message: '' })
  const [serverDetails, setServerDetails] = useState(null)
  const [publicCheck, setPublicCheck] = useState({ status: null, message: '' })

  useEffect(() => {
    runLocalCheck()
    if (hasPublicDomain) runPublicCheck()
  }, [])

  const runLocalCheck = async () => {
    setLocalCheck({ status: 'checking', message: 'Checking...' })
    try {
      const url = encodeURIComponent(hs.url)
      const res = await fetch(`/api/homeserver/check?url=${url}`)
      const data = await res.json()
      if (data.ok) {
        setLocalCheck({ status: 'success', message: `Healthy (${data.versions.length} versions)` })
        setServerDetails(data)
      } else {
        setLocalCheck({ status: 'error', message: data.error || 'Unreachable' })
      }
    } catch (err) {
      setLocalCheck({ status: 'error', message: err.message })
    }
  }

  const runPublicCheck = async () => {
    setPublicCheck({ status: 'checking', message: 'Checking...' })
    try {
      const res = await fetch('/api/homeserver/check-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: hs.domain })
      })
      const data = await res.json()
      if (data.ok) {
        setPublicCheck({ status: 'success', message: `Reachable (${data.versions.length} versions)` })
      } else {
        setPublicCheck({ status: 'error', message: data.error || 'Unreachable' })
      }
    } catch (err) {
      setPublicCheck({ status: 'error', message: err.message })
    }
  }

  const runAllChecks = () => {
    runLocalCheck()
    if (hasPublicDomain) runPublicCheck()
  }

  const resetBrain = async () => {
    if (resetStep < 2) {
      setResetStep(resetStep + 1)
      return
    }
    setResetting(true)
    try {
      await fetch('/api/onboarding/reset', { method: 'POST' })
      window.location.reload()
    } catch (err) {
      console.error('Reset failed:', err)
      setResetting(false)
    }
  }

  const factoryReset = async () => {
    if (factoryStep < 2) {
      setFactoryStep(factoryStep + 1)
      return
    }
    setFactoryResetting(true)
    try {
      await fetch('/api/onboarding/factory-reset', { method: 'POST' })
      window.location.reload()
    } catch (err) {
      console.error('Factory reset failed:', err)
      setFactoryResetting(false)
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>

      <div className="max-w-3xl space-y-6">

        {/* ── Homeserver Info ── */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">Homeserver Info</h2>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              isLocal ? 'bg-nervur-100 text-nervur-700' : 'bg-purple-100 text-purple-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isLocal ? 'bg-nervur-500' : 'bg-purple-500'}`} />
              {isLocal ? 'Managed locally' : 'External server'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <span className="text-gray-500">Server name</span>
              <p className="font-mono font-medium text-gray-900">{hs.serverName || '-'}</p>
            </div>
            <div>
              <span className="text-gray-500">URL</span>
              <p className="font-mono font-medium text-gray-900">{hs.url || '-'}</p>
            </div>
            <div>
              <span className="text-gray-500">Type</span>
              <p className="font-medium text-gray-900 capitalize">{hs.type || 'remote'}</p>
            </div>
            {hasPublicDomain && (
              <div>
                <span className="text-gray-500">Public domain</span>
                <p className="font-mono font-medium text-gray-900">{hs.domain}</p>
              </div>
            )}
          </div>

          {/* Connectivity checks */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Connectivity</span>
              <button onClick={runAllChecks} className="text-xs text-nervur-600 hover:text-nervur-800">
                Run checks
              </button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {localCheck.status === 'checking' ? <Spinner /> :
                   localCheck.status === 'success' ? <CheckIcon /> :
                   localCheck.status === 'error' ? <ErrorIcon /> :
                   <span className="w-4 h-4 rounded-full border-2 border-gray-300" />}
                  <span className="text-gray-600">{isLocal ? 'Local endpoint' : 'Server endpoint'}</span>
                  <span className="font-mono text-xs text-gray-400">{hs.url || '-'}</span>
                </div>
                <span className={`text-xs ${
                  localCheck.status === 'success' ? 'text-green-600' :
                  localCheck.status === 'error' ? 'text-red-600' : 'text-gray-400'
                }`}>
                  {localCheck.message || 'Not checked'}
                </span>
              </div>
              {hasPublicDomain && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {publicCheck.status === 'checking' ? <Spinner /> :
                     publicCheck.status === 'success' ? <CheckIcon /> :
                     publicCheck.status === 'error' ? <ErrorIcon /> :
                     <span className="w-4 h-4 rounded-full border-2 border-gray-300" />}
                    <span className="text-gray-600">Public endpoint</span>
                    <span className="font-mono text-xs text-gray-400">https://{hs.domain}</span>
                  </div>
                  <span className={`text-xs ${
                    publicCheck.status === 'success' ? 'text-green-600' :
                    publicCheck.status === 'error' ? 'text-red-600' : 'text-gray-400'
                  }`}>
                    {publicCheck.message || 'Not checked'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Server Details (from health check) ── */}
        {serverDetails?.versions && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Server Details</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {serverDetails.server && (
                <div>
                  <span className="text-gray-500">Software</span>
                  <p className="font-medium text-gray-900">
                    {serverDetails.server.name}
                    {serverDetails.server.version && <span className="text-gray-500 ml-1">{serverDetails.server.version}</span>}
                  </p>
                </div>
              )}
              <div>
                <span className="text-gray-500">Latest spec</span>
                <p className="font-mono font-semibold text-gray-900">{sortVersions(serverDetails.versions).at(-1)}</p>
              </div>
              <div>
                <span className="text-gray-500">Spec versions</span>
                <p className="font-mono text-gray-900 text-xs">
                  {sortVersions(serverDetails.versions.filter(v => v.startsWith('v'))).join(', ')}
                </p>
              </div>
              {serverDetails.versions.some(v => v.startsWith('r')) && (
                <div>
                  <span className="text-gray-500">Legacy versions</span>
                  <p className="font-mono text-gray-400 text-xs">
                    {sortVersions(serverDetails.versions.filter(v => v.startsWith('r'))).join(', ')}
                  </p>
                </div>
              )}
              {serverDetails.capabilities?.defaultRoomVersion && (
                <div>
                  <span className="text-gray-500">Default room version</span>
                  <p className="font-mono text-gray-900">{serverDetails.capabilities.defaultRoomVersion}</p>
                </div>
              )}
            </div>
            {serverDetails.unstableFeatures?.length > 0 && (
              <details className="mt-4">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  {serverDetails.unstableFeatures.length} unstable features enabled
                </summary>
                <div className="mt-2 flex flex-wrap gap-1">
                  {serverDetails.unstableFeatures.map(f => (
                    <span key={f} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {f}
                    </span>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ── Brain Identity ── */}
        {config?.brain && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Brain Identity</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <span className="text-gray-500">Display name</span>
                <p className="font-medium text-gray-900">{config.brain.name}</p>
              </div>
              <div>
                <span className="text-gray-500">User ID</span>
                <p className="font-mono font-medium text-gray-900">{config.brain.user_id}</p>
              </div>
              <div>
                <span className="text-gray-500">Username</span>
                <p className="font-mono font-medium text-gray-900">{config.brain.username}</p>
              </div>
              <div>
                <span className="text-gray-500">Device ID</span>
                <p className="font-mono font-medium text-gray-900">{config.brain.device_id}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Danger Zone ── */}
        <div className="bg-white rounded-xl shadow-sm p-6 border-2 border-red-200">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h2>

          <div className="space-y-4">
            {/* Hard Reset */}
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Wipe brain configuration and restart onboarding. Homeserver data is preserved.
              </p>
              <button
                onClick={resetBrain}
                disabled={resetting}
                className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 ${
                  resetStep === 0 ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                  resetStep === 1 ? 'bg-red-500 text-white hover:bg-red-600' :
                  'bg-red-700 text-white hover:bg-red-800'
                }`}
              >
                {resetting ? 'Resetting...' :
                 resetStep === 0 ? 'Reset Brain' :
                 resetStep === 1 ? 'Are you sure? Click again to confirm' :
                 'Final confirmation — wipe config'}
              </button>
              {resetStep > 0 && !resetting && (
                <button
                  onClick={() => setResetStep(0)}
                  className="ml-3 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Factory Reset */}
            {isLocal && (
              <div className="pt-3 border-t border-red-100">
                <p className="text-sm text-gray-600 mb-2">
                  Wipe <strong>everything</strong>: config, tunnel, homeserver data, users, and registration key.
                  Containers will be stopped and volumes removed. This cannot be undone.
                </p>
                <button
                  onClick={factoryReset}
                  disabled={factoryResetting}
                  className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 ${
                    factoryStep === 0 ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                    factoryStep === 1 ? 'bg-red-500 text-white hover:bg-red-600' :
                    'bg-red-700 text-white hover:bg-red-800'
                  }`}
                >
                  {factoryResetting ? 'Wiping everything...' :
                   factoryStep === 0 ? 'Factory Reset' :
                   factoryStep === 1 ? 'Are you sure? This deletes ALL data' :
                   'Final confirmation — destroy everything'}
                </button>
                {factoryStep > 0 && !factoryResetting && (
                  <button
                    onClick={() => setFactoryStep(0)}
                    className="ml-3 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
