import { useState, useEffect, useCallback } from 'react'

const CheckIcon = () => (
  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const ErrorIcon = () => (
  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const WarnIcon = () => (
  <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
    />
  </svg>
)

const Spinner = () => (
  <svg className="w-5 h-5 animate-spin text-nervur-500" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
)

const ButtonSpinner = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
)

function StepItem({ step }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5">
        {step.status === 'pass' && <CheckIcon />}
        {step.status === 'fail' && <ErrorIcon />}
        {step.status === 'warn' && <WarnIcon />}
        {step.status === 'checking' && <Spinner />}
        {!step.status && <div className="w-5 h-5 rounded-full border-2 border-gray-200" />}
      </div>
      <div className="flex-1">
        <p className={`font-medium ${step.status ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
        {step.message && <p className="text-sm text-gray-500">{step.message}</p>}
        {step.help && step.status === 'fail' && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{step.help}</p>
          </div>
        )}
        {step.help && step.status === 'warn' && (
          <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">{step.help}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Parse Matrix spec version strings like "v1.12" or "r0.6.1"
function parseSpecVersion(str) {
  const v = str.match(/^v(\d+)\.(\d+)$/)
  if (v) return { prefix: 1, parts: [+v[1], +v[2]] }
  const r = str.match(/^r(\d+)\.(\d+)\.(\d+)$/)
  if (r) return { prefix: 0, parts: [+r[1], +r[2], +r[3]] }
  return null
}

function compareSpecVersions(a, b) {
  const pa = parseSpecVersion(a)
  const pb = parseSpecVersion(b)
  if (!pa && !pb) return 0
  if (!pa) return -1
  if (!pb) return 1
  if (pa.prefix !== pb.prefix) return pa.prefix - pb.prefix
  for (let i = 0; i < Math.max(pa.parts.length, pb.parts.length); i++) {
    const diff = (pa.parts[i] || 0) - (pb.parts[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function sortedVersions(versions) {
  return [...versions].sort(compareSpecVersions)
}

const PROVISION_STEPS = [
  { id: 'preflight', label: 'System checks' },
  { id: 'configure', label: 'Generate configuration' },
  { id: 'pull', label: 'Pull Tuwunel image' },
  { id: 'start', label: 'Start homeserver' },
  { id: 'verify', label: 'Verify homeserver' },
  { id: 'ready', label: 'Homeserver ready' }
]

export default function ServerStep({ path, onPathChange, onVerified, savedConfig, onReset, existingServer }) {
  // ── Local state ──
  const [serverName, setServerName] = useState('nervur.local')
  const [port, setPort] = useState('8008')
  const [localPhase, setLocalPhase] = useState(existingServer ? 'done' : 'checking') // checking | choose | input | provision | done
  const [provSteps, setProvSteps] = useState([])
  const [localError, setLocalError] = useState(null)
  const [preflightData, setPreflightData] = useState(null)
  const [provisionedResult, setProvisionedResult] = useState(existingServer || null)
  const [portStatus, setPortStatus] = useState(null) // null | 'checking' | 'available' | 'busy'

  // ── Remote state ──
  const [url, setUrl] = useState(existingServer?.input || '')
  const [hsValidation, setHsValidation] = useState({ status: null, message: '' })
  const [verified, setVerified] = useState(null)

  // Whether any async operation is running (disables toggle)
  const isBusy =
    (path === 'local' && (localPhase === 'checking' || localPhase === 'provision')) ||
    hsValidation.status === 'checking'

  // ── Local helpers ──
  function updateProvStep(id, updates) {
    setProvSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)))
  }

  const runInitialCheck = useCallback(async () => {
    setLocalPhase('checking')
    setLocalError(null)
    setProvSteps(PROVISION_STEPS.map((s) => ({ ...s, status: null, message: null })))
    updateProvStep('preflight', { status: 'checking', message: 'Checking Docker and system...' })

    try {
      const res = await fetch('/api/onboarding/local/preflight', { method: 'POST' })
      const data = await res.json()
      setPreflightData(data)

      if (!data.success) {
        const failedChecks = data.results.filter((r) => r.status === 'fail')
        updateProvStep('preflight', {
          status: 'fail',
          message: failedChecks.map((c) => c.message).join('; '),
          help: failedChecks.map((c) => c.help).join(' ')
        })
        setLocalPhase('input')
        return
      }

      if (data.existing || data.matrixOnPort) {
        updateProvStep('preflight', { status: 'pass', message: 'Docker OK' })
        setLocalPhase('choose')
      } else {
        const msg = data.defaultPortBusy ? 'Docker OK (port 8008 in use by another service)' : 'Docker and ports OK'
        updateProvStep('preflight', { status: data.defaultPortBusy ? 'warn' : 'pass', message: msg })
        setLocalPhase('input')
      }
    } catch (err) {
      updateProvStep('preflight', { status: 'fail', message: err.message })
      setLocalPhase('input')
    }
  }, [])

  // Restore state from saved config on mount
  useEffect(() => {
    // Skip re-checking local if we already have a verified server (coming back from brain step)
    if (existingServer && path === 'local') return
    // For remote, re-verify the existing URL automatically
    if (existingServer && path === 'remote' && existingServer.url) {
      setHsValidation({ status: 'checking', message: 'Reconnecting to homeserver...' })
      fetch('/api/onboarding/verify-homeserver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: existingServer.url })
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setHsValidation({ status: 'error', message: data.error })
          } else {
            setVerified(data)
            setHsValidation({ status: 'success', message: `Homeserver is reachable (${data.versions.length} API versions)` })
          }
        })
        .catch((err) => setHsValidation({ status: 'error', message: err.message }))
      return
    }

    const ob = savedConfig?.onboarding
    if (!ob) {
      if (path === 'local') runInitialCheck()
      return
    }

    if (ob.path === 'local') {
      if (ob.serverName) setServerName(ob.serverName)
      if (ob.port) setPort(String(ob.port))
      runInitialCheck()
    } else if (ob.path === 'remote' && (ob.input || ob.homeserver?.url)) {
      setUrl(ob.input || ob.homeserver.url)
      setHsValidation({ status: 'checking', message: 'Reconnecting to homeserver...' })

      fetch('/api/onboarding/verify-homeserver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ob.input })
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setHsValidation({ status: 'error', message: data.error })
          } else {
            setVerified(data)
            setHsValidation({
              status: 'success',
              message: `Homeserver is reachable (${data.versions.length} API versions)`
            })
          }
        })
        .catch((err) => {
          setHsValidation({ status: 'error', message: err.message })
        })
    }
  }, [savedConfig, runInitialCheck, path])

  // Check port availability when user changes it (local path)
  const portNum = parseInt(port, 10)
  const portValid = !isNaN(portNum) && portNum >= 1 && portNum <= 65535

  useEffect(() => {
    if (path !== 'local' || localPhase !== 'input') return
    if (!portValid) {
      setPortStatus(null)
      return
    }
    setPortStatus('checking')
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/onboarding/local/check-port', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ port: portNum })
        })
        const data = await res.json()
        setPortStatus(data.available ? 'available' : 'busy')
      } catch {
        setPortStatus(null)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [port, localPhase, portNum, portValid, path])

  // ── Local: connect existing container ──
  async function connectExisting(hsPort) {
    setLocalPhase('provision')
    updateProvStep('preflight', { status: 'pass', message: 'Using existing homeserver' })
    updateProvStep('configure', { status: 'pass', message: 'Skipped (already configured)' })
    updateProvStep('pull', { status: 'pass', message: 'Skipped (already pulled)' })
    updateProvStep('start', { status: 'pass', message: 'Skipped (already running)' })

    const hsUrl = `http://localhost:${hsPort}`

    try {
      updateProvStep('verify', { status: 'checking', message: `Verifying Matrix API on port ${hsPort}...` })
      const verRes = await fetch('/api/onboarding/local/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: hsUrl })
      })
      const verData = await verRes.json()
      if (!verData.success) throw new Error(verData.error || 'Verification failed')
      updateProvStep('verify', {
        status: 'pass',
        message: `Matrix API responding (${verData.versions?.length} versions)`
      })

      const statusRes = await fetch('/api/onboarding/local/status')
      const statusData = await statusRes.json()
      const sn = statusData.serverName || serverName

      updateProvStep('ready', { status: 'pass', message: `Homeserver running at ${hsUrl}` })
      setLocalPhase('done')
      setProvisionedResult({ url: hsUrl, serverName: sn, registrationSecret: statusData.registrationSecret })
    } catch (err) {
      setLocalError(err.message)
      setLocalPhase('choose')
      setProvSteps((prev) =>
        prev.map((s) => (s.status === 'checking' ? { ...s, status: 'fail', message: err.message } : s))
      )
    }
  }

  function reconfigure() {
    setLocalPhase('input')
    updateProvStep('preflight', { status: 'pass', message: 'Docker OK — reconfiguring' })
  }

  async function provisionLocal() {
    setLocalPhase('provision')
    setLocalError(null)
    setProvSteps((prev) => prev.map((s) => (s.id === 'preflight' ? s : { ...s, status: null, message: null })))

    let regSecret = null
    let hsUrl = `http://localhost:${portNum}`

    try {
      updateProvStep('configure', { status: 'checking', message: 'Generating config files...' })
      const cfgRes = await fetch('/api/onboarding/local/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverName, port: portNum })
      })
      const cfgData = await cfgRes.json()
      if (!cfgData.success) throw new Error(cfgData.error || 'Configuration failed')
      regSecret = cfgData.registrationSecret
      updateProvStep('configure', { status: 'pass', message: 'Config files written' })

      updateProvStep('pull', { status: 'checking', message: 'Pulling Docker image (this may take a while)...' })
      const pullRes = await fetch('/api/onboarding/local/pull', { method: 'POST' })
      const pullData = await pullRes.json()
      if (!pullData.success) throw new Error(pullData.error || 'Image pull failed')
      updateProvStep('pull', { status: 'pass', message: 'Image pulled' })

      updateProvStep('start', { status: 'checking', message: 'Starting homeserver container...' })
      const startRes = await fetch('/api/onboarding/local/start', { method: 'POST' })
      const startData = await startRes.json()
      if (!startData.success) throw new Error(startData.error || 'Failed to start homeserver')
      hsUrl = startData.url
      updateProvStep('start', { status: 'pass', message: 'Container running' })

      updateProvStep('verify', { status: 'checking', message: 'Verifying Matrix API...' })
      const verRes = await fetch('/api/onboarding/local/verify', { method: 'POST' })
      const verData = await verRes.json()
      if (!verData.success) throw new Error(verData.error || 'Verification failed')
      updateProvStep('verify', {
        status: 'pass',
        message: `Matrix API responding (${verData.versions?.length} versions)`
      })

      updateProvStep('ready', { status: 'pass', message: `Homeserver running at ${hsUrl}` })
      setLocalPhase('done')
      setProvisionedResult({ url: hsUrl, serverName, registrationSecret: regSecret })
    } catch (err) {
      setLocalError(err.message)
      setLocalPhase('input')
      setProvSteps((prev) =>
        prev.map((s) => (s.status === 'checking' ? { ...s, status: 'fail', message: err.message } : s))
      )
    }
  }

  // ── Remote helpers ──
  async function verifyHs() {
    setHsValidation({ status: 'checking', message: 'Connecting to homeserver...' })
    try {
      const res = await fetch('/api/onboarding/verify-homeserver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setVerified(data)
      setHsValidation({
        status: 'success',
        message: `Homeserver is reachable (${data.versions.length} API versions)`
      })
    } catch (err) {
      setHsValidation({ status: 'error', message: err.message })
    }
  }

  // ── Path toggle handler ──
  function handlePathChange(newPath) {
    if (newPath === path || isBusy) return
    onPathChange(newPath)
    // Reset local state when switching
    if (newPath === 'local') {
      setUrl('')
      setVerified(null)
      setHsValidation({ status: null, message: '' })
      runInitialCheck()
    } else {
      setLocalPhase('checking')
      setProvSteps([])
      setLocalError(null)
      setProvisionedResult(null)
    }
  }

  const localHasFailed = provSteps.some((s) => s.status === 'fail')
  const tuwunelContainers = preflightData?.tuwunelContainers || []

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Homeserver</h2>
      <p className="text-gray-600 mb-6">
        Every brain needs a Matrix homeserver for its identity. Choose how to set yours up.
      </p>

      {/* Segmented control toggle */}
      <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => handlePathChange('local')}
          disabled={isBusy}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            path === 'local' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Local Homeserver
        </button>
        <button
          onClick={() => handlePathChange('remote')}
          disabled={isBusy}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            path === 'remote' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Remote Homeserver
        </button>
      </div>

      {/* ── Local view ── */}
      {path === 'local' && (
        <div>
          {/* Progressive checklist */}
          {provSteps.length > 0 && (
            <div className="mb-6 border border-gray-200 rounded-lg divide-y divide-gray-100 px-4">
              {provSteps.map((step) => (
                <StepItem key={step.id} step={step} />
              ))}
            </div>
          )}

          {/* Choice: use existing container or reconfigure */}
          {localPhase === 'choose' && (
            <div className="mb-6">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                <p className="text-green-800 text-sm font-medium mb-1">Existing homeserver detected</p>
                {tuwunelContainers.length > 0 ? (
                  <div className="text-sm text-green-700">
                    {tuwunelContainers.map((c) => (
                      <p key={c.name}>
                        <code className="bg-green-100 px-1 rounded">{c.name}</code>
                        {c.port ? ` on port ${c.port}` : ''} — {c.status}
                        {c.running ? '' : ' (stopped)'}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-green-700">Matrix homeserver responding on port 8008</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    const running = tuwunelContainers.find((c) => c.running)
                    connectExisting(running?.port || 8008)
                  }}
                  disabled={tuwunelContainers.length > 0 && !tuwunelContainers.some((c) => c.running)}
                  className="p-4 bg-gray-50 rounded-lg text-left hover:bg-nervur-50 hover:border-nervur-300 border border-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <h3 className="font-semibold text-gray-900">Use existing</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {tuwunelContainers.some((c) => c.running)
                      ? `Connect to the running homeserver on port ${tuwunelContainers.find((c) => c.running)?.port || 8008}`
                      : 'No running homeserver found'}
                  </p>
                </button>
                <button
                  onClick={reconfigure}
                  className="p-4 bg-gray-50 rounded-lg text-left hover:bg-nervur-50 hover:border-nervur-300 border border-gray-200 transition-colors"
                >
                  <h3 className="font-semibold text-gray-900">Reconfigure</h3>
                  <p className="text-sm text-gray-600 mt-1">Replace with a new local homeserver setup</p>
                </button>
              </div>
            </div>
          )}

          {/* Server name + port inputs */}
          {localPhase === 'input' && (
            <div className="mb-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Server name</label>
                <input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="nervur.local"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-nervur-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Users will have IDs like{' '}
                  <code className="bg-gray-100 px-1 rounded">@brain:{serverName || 'nervur.local'}</code>.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                <div className="relative">
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    min={1}
                    max={65535}
                    className={`w-full px-4 py-3 border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-nervur-500 focus:border-transparent ${
                      portStatus === 'busy'
                        ? 'border-red-400 bg-red-50'
                        : portStatus === 'available'
                          ? 'border-green-400'
                          : 'border-gray-300'
                    }`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {portStatus === 'checking' && <Spinner />}
                    {portStatus === 'available' && <CheckIcon />}
                    {portStatus === 'busy' && <ErrorIcon />}
                  </div>
                </div>
                {portStatus === 'busy' && (
                  <p className="text-xs text-red-600 mt-1">Port {port} is already in use. Pick a different port.</p>
                )}
                {portStatus === 'available' && <p className="text-xs text-green-600 mt-1">Port {port} is available.</p>}
                {!portStatus && <p className="text-xs text-gray-500 mt-1">The port the homeserver will listen on.</p>}
                {portStatus === 'checking' && (
                  <p className="text-xs text-gray-500 mt-1">Checking port availability...</p>
                )}
              </div>
            </div>
          )}

          {localError && !provSteps.some((s) => s.status === 'fail') && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{localError}</p>
            </div>
          )}

          {localPhase === 'done' && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 text-sm font-medium">Homeserver provisioned successfully.</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            {(localPhase === 'done' || localPhase === 'input') && (
              <button
                onClick={runInitialCheck}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
            )}
            {localPhase === 'checking' && (
              <span className="text-sm text-nervur-600 flex items-center gap-2">
                <Spinner /> Checking system...
              </span>
            )}
            {localPhase === 'input' && !localHasFailed && (
              <button
                onClick={provisionLocal}
                disabled={!serverName.trim() || !portValid || portStatus === 'busy' || portStatus === 'checking'}
                className="flex items-center gap-2 px-6 py-3 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 disabled:opacity-50"
              >
                Provision Homeserver
              </button>
            )}
            {localPhase === 'input' && localHasFailed && (
              <button
                onClick={runInitialCheck}
                className="flex items-center gap-2 px-6 py-3 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700"
              >
                Retry
              </button>
            )}
            {localPhase === 'done' && provisionedResult && (
              <button
                onClick={() => onVerified(provisionedResult)}
                className="flex items-center gap-2 px-6 py-3 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700"
              >
                Create Brain &rarr;
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Remote view ── */}
      {path === 'remote' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Server address</label>
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setVerified(null)
              setHsValidation({ status: null, message: '' })
            }}
            placeholder="nervur.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-nervur-500 focus:border-transparent mb-4"
          />

          <div className="flex items-center gap-3">
            {!verified && (
              <button
                onClick={verifyHs}
                disabled={!url || hsValidation.status === 'checking'}
                className="flex items-center gap-2 px-6 py-3 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 disabled:opacity-50"
              >
                {hsValidation.status === 'checking' && <ButtonSpinner />}
                {hsValidation.status === 'checking' ? 'Verifying...' : 'Verify Connection'}
              </button>
            )}
            {verified && (
              <button
                onClick={() => onVerified({ url: verified.url, serverName: verified.serverName, input: url })}
                className="px-6 py-3 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700"
              >
                Create Brain &rarr;
              </button>
            )}
          </div>

          {hsValidation.status === 'checking' && (
            <div className="flex items-center gap-2 mt-3 text-sm text-nervur-600">
              <Spinner />
              <span>{hsValidation.message}</span>
            </div>
          )}
          {hsValidation.status === 'success' && verified && (
            <div className="mt-4 space-y-3">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckIcon />
                  <p className="text-green-800 font-medium text-sm">{hsValidation.message}</p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-green-700">
                  <span className="text-green-600">Homeserver URL</span>
                  <code className="bg-green-100 px-1 rounded">{verified.url}</code>
                  <span className="text-green-600">Server name</span>
                  <code className="bg-green-100 px-1 rounded">{verified.serverName}</code>
                  {verified.server && (
                    <>
                      <span className="text-green-600">Software</span>
                      <span>
                        {verified.server.name}
                        {verified.server.version && ` ${verified.server.version}`}
                      </span>
                    </>
                  )}
                  <span className="text-green-600">Latest spec</span>
                  <span className="font-semibold">{sortedVersions(verified.versions).at(-1)}</span>
                  <span className="text-green-600">Spec versions</span>
                  <span>{sortedVersions(verified.versions.filter((v) => v.startsWith('v'))).join(', ')}</span>
                  {verified.versions.some((v) => v.startsWith('r')) && (
                    <>
                      <span className="text-green-600">Legacy versions</span>
                      <span className="text-green-600/60">
                        {sortedVersions(verified.versions.filter((v) => v.startsWith('r'))).join(', ')}
                      </span>
                    </>
                  )}
                  {verified.capabilities?.defaultRoomVersion && (
                    <>
                      <span className="text-green-600">Default room version</span>
                      <span>{verified.capabilities.defaultRoomVersion}</span>
                    </>
                  )}
                </div>
                {verified.unstableFeatures?.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-green-600 cursor-pointer hover:text-green-700">
                      {verified.unstableFeatures.length} unstable features enabled
                    </summary>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {verified.unstableFeatures.map((f) => (
                        <span key={f} className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          {f}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )}
          {hsValidation.status === 'error' && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{hsValidation.message}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
