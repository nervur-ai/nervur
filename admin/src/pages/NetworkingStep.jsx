import { useState, useEffect } from 'react'
import { CheckIcon } from '../onboarding/icons.jsx'
import CheckItem from '../onboarding/CheckItem.jsx'
import { ACTIONS } from '../onboarding/machine.js'

export default function NetworkingStep({ ctx, dispatch, savedConfig }) {
  const { server } = ctx
  const serverName = server?.serverName

  // Phases: choose | direct-domain | domain | tunnel-input | configuring | done
  const [phase, setPhase] = useState('choose')
  const [domain, setDomain] = useState(serverName || '')
  const [tunnelToken, setTunnelToken] = useState('')
  const [checks, setChecks] = useState([])
  const [publicUrl, setPublicUrl] = useState(null)
  const [probing, setProbing] = useState(false)
  const [networkMode, setNetworkMode] = useState(null) // 'tunnel' | 'direct'

  // Resume: if saved config has public networking AND the onboarding step is
  // actually at 'network', re-verify.
  useEffect(() => {
    const ob = savedConfig?.onboarding
    const net = ob?.networking
    const atNetworkStep = ob?.step === 'network' || ob?.step === 'networking'
    if (atNetworkStep && net?.networkMode === 'public' && net.domain) {
      setDomain(net.domain)
      if (net.tunnelToken) setTunnelToken(net.tunnelToken)
      setPhase('configuring')
      verifyTunnel(net.domain)
    }
  }, [savedConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  async function verifyTunnel(domainOverride) {
    const d = domainOverride || domain
    setChecks([{ id: 'verify', label: 'Verify tunnel', status: 'checking', message: `Checking https://${d}...` }])
    try {
      const res = await fetch('/api/onboarding/local/networking/check-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: d })
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Tunnel check failed')
      setChecks([
        {
          id: 'verify',
          label: 'Verify tunnel',
          status: 'pass',
          message: `Tunnel reachable (${data.versions?.length || 0} API versions)`
        }
      ])
      setPublicUrl(data.publicUrl)
      setPhase('done')
    } catch (err) {
      setChecks([
        {
          id: 'verify',
          label: 'Verify tunnel',
          status: 'fail',
          message: err.message,
          help: 'Make sure your Cloudflare Tunnel is running and DNS is configured.'
        }
      ])
    }
  }

  // Probe domain: check public URL first, then inspect cloudflared container health
  async function probeDomain() {
    if (!domain.trim()) return
    setProbing(true)
    setChecks([
      { id: 'tunnel', label: 'Check public endpoint', status: 'checking', message: `Probing https://${domain}...` },
      { id: 'container', label: 'Check cloudflared container', status: 'pending', message: '' }
    ])

    // Step 1: Check public URL
    let tunnelOk = false
    let tunnelData = null
    try {
      const res = await fetch('/api/onboarding/local/networking/check-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      })
      tunnelData = await res.json()
      tunnelOk = res.ok && tunnelData.success
    } catch {
      tunnelData = { success: false, error: 'Could not reach domain' }
    }

    if (tunnelOk) {
      setChecks([
        { id: 'tunnel', label: 'Check public endpoint', status: 'pass', message: `Reachable (${tunnelData.versions?.length || 0} API versions)` },
        { id: 'container', label: 'Check cloudflared container', status: 'pass', message: 'Tunnel active' }
      ])
      setPublicUrl(tunnelData.publicUrl)
      await fetch('/api/onboarding/local/networking/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ networkMode: 'public', domain })
      })
      setPhase('done')
      setProbing(false)
      return
    }

    // Tunnel not reachable — check WHY by inspecting the cloudflared container
    setChecks(prev => prev.map(c =>
      c.id === 'tunnel' ? { ...c, status: 'fail', message: tunnelData?.error || 'Not reachable' } :
      c.id === 'container' ? { ...c, status: 'checking', message: 'Inspecting cloudflared container...' } : c
    ))

    let containerData = null
    try {
      const res = await fetch('/api/onboarding/local/networking/check-cloudflared', { method: 'POST' })
      containerData = await res.json()
    } catch {
      containerData = { success: false, running: false, error: 'Could not check container' }
    }

    if (containerData.running) {
      setChecks(prev => prev.map(c =>
        c.id === 'container' ? { ...c, status: 'pass', message: 'Cloudflared running — reconfiguring homeserver...' } : c
      ))
      try {
        const cfgRes = await fetch('/api/onboarding/local/networking/configure-tunnel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain })
        })
        const cfgData = await cfgRes.json()
        if (cfgRes.ok && cfgData.success) {
          setPublicUrl(cfgData.publicUrl)
          setChecks([
            { id: 'tunnel', label: 'Check public endpoint', status: 'pass', message: 'Tunnel connected and homeserver reconfigured' },
            { id: 'container', label: 'Check cloudflared container', status: 'pass', message: 'Running' }
          ])
          setPhase('done')
          setProbing(false)
          return
        }
      } catch {}
      setChecks(prev => prev.map(c =>
        c.id === 'container' ? {
          ...c, status: 'fail',
          message: 'Container running but tunnel not working',
          help: 'The cloudflared container is running but the tunnel is not responding. You may need to provide a new token.'
        } : c
      ))
      setPhase('tunnel-input')
    } else if (containerData.error && (
      containerData.error.includes('Invalid tunnel token') ||
      containerData.error.includes('not valid') ||
      containerData.error.includes('Unauthorized')
    )) {
      setChecks(prev => prev.map(c =>
        c.id === 'container' ? {
          ...c, status: 'fail',
          message: 'Invalid tunnel token',
          help: 'The cloudflared container has a bad token and is crash-looping. Enter a valid token from your Cloudflare Zero Trust dashboard.'
        } : c
      ))
      setPhase('tunnel-input')
    } else if (!containerData.running && containerData.status && containerData.status !== 'not_found') {
      setChecks(prev => prev.map(c =>
        c.id === 'container' ? {
          ...c, status: 'fail',
          message: `Cloudflared is ${containerData.status}`,
          help: containerData.error || 'The cloudflared container is not running. Enter a valid token to reconfigure it.'
        } : c
      ))
      setPhase('tunnel-input')
    } else {
      setChecks(prev => prev.map(c =>
        c.id === 'container' ? { ...c, status: 'fail', message: 'No cloudflared container found' } : c
      ))
      setPhase('tunnel-input')
    }
    setProbing(false)
  }

  async function configureTunnel() {
    setNetworkMode('tunnel')
    setPhase('configuring')

    const steps = [
      { id: 'dns', label: 'Check DNS', message: `Resolving ${domain}...` },
      { id: 'configure', label: 'Reconfigure homeserver', message: 'Writing tunnel config...' },
      { id: 'cloudflared', label: 'Check cloudflared', message: 'Waiting for container...' },
      { id: 'verify', label: 'Verify tunnel', message: 'Waiting for tunnel...' }
    ]
    setChecks(steps.map((s) => ({ ...s, status: 'pending' })))

    // Step 1: Check DNS
    setChecks((prev) =>
      prev.map((c) => (c.id === 'dns' ? { ...c, status: 'checking', message: `Resolving ${domain}...` } : c))
    )
    try {
      const res = await fetch('/api/onboarding/local/networking/check-dns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'dns' ? { ...c, status: 'pass', message: `Resolved to ${data.addresses.join(', ')}` } : c
        )
      )
    } catch (err) {
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'dns'
            ? { ...c, status: 'fail', message: err.message, help: 'Configure a DNS A record pointing to your server.' }
            : c
        )
      )
      return
    }

    // Step 2: Reconfigure homeserver with tunnel
    setChecks((prev) =>
      prev.map((c) =>
        c.id === 'configure'
          ? { ...c, status: 'checking', message: 'Rewriting config and restarting containers...' }
          : c
      )
    )
    try {
      const res = await fetch('/api/onboarding/local/networking/configure-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, tunnelToken })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'configure' ? { ...c, status: 'pass', message: 'Homeserver reconfigured with tunnel' } : c
        )
      )
    } catch (err) {
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'configure'
            ? { ...c, status: 'fail', message: err.message, help: 'Check Docker logs for details.' }
            : c
        )
      )
      return
    }

    // Step 3: Check cloudflared container status
    setChecks((prev) =>
      prev.map((c) =>
        c.id === 'cloudflared' ? { ...c, status: 'checking', message: 'Checking cloudflared container...' } : c
      )
    )
    let cfOk = false
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await fetch('/api/onboarding/local/networking/check-cloudflared', { method: 'POST' })
        const data = await res.json()
        if (data.success && data.running) {
          setChecks((prev) =>
            prev.map((c) =>
              c.id === 'cloudflared' ? { ...c, status: 'pass', message: `Cloudflared running (${data.status})` } : c
            )
          )
          cfOk = true
          break
        }
        if (data.error && (data.error.includes('Invalid tunnel token') || data.error.includes('Unauthorized'))) {
          setChecks((prev) =>
            prev.map((c) =>
              c.id === 'cloudflared'
                ? {
                    ...c,
                    status: 'fail',
                    message: 'Invalid tunnel token',
                    help: 'The token was rejected by Cloudflare. Go to Zero Trust dashboard, copy the correct token, and try again.'
                  }
                : c
            )
          )
          return
        }
        if (data.error && data.error.includes('failed to connect')) {
          setChecks((prev) =>
            prev.map((c) =>
              c.id === 'cloudflared'
                ? {
                    ...c,
                    status: 'fail',
                    message: 'Cannot reach Cloudflare',
                    help: 'Cloudflared cannot connect to Cloudflare servers. Check your internet connection.'
                  }
                : c
            )
          )
          return
        }
      } catch {
        // container may not exist yet, keep polling
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
    if (!cfOk) {
      try {
        const res = await fetch('/api/onboarding/local/networking/check-cloudflared', { method: 'POST' })
        const data = await res.json()
        setChecks((prev) =>
          prev.map((c) =>
            c.id === 'cloudflared'
              ? {
                  ...c,
                  status: 'fail',
                  message: data.error || 'Cloudflared did not start',
                  help: data.error?.includes('token')
                    ? 'Check your tunnel token in the Cloudflare Zero Trust dashboard.'
                    : 'The cloudflared container failed to start. Check Docker logs with: docker logs nervur-cloudflared'
                }
              : c
          )
        )
      } catch {
        setChecks((prev) =>
          prev.map((c) =>
            c.id === 'cloudflared'
              ? {
                  ...c,
                  status: 'fail',
                  message: 'Cloudflared container not found',
                  help: 'The container may not have been created. Check Docker logs for details.'
                }
              : c
          )
        )
      }
      return
    }

    // Step 4: Verify tunnel
    setChecks((prev) =>
      prev.map((c) => (c.id === 'verify' ? { ...c, status: 'checking', message: `Checking https://${domain}...` } : c))
    )
    try {
      const res = await fetch('/api/onboarding/local/networking/check-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Tunnel check failed')
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'verify'
            ? { ...c, status: 'pass', message: `Tunnel reachable (${data.versions?.length || 0} API versions)` }
            : c
        )
      )
      setPublicUrl(data.publicUrl)
      setPhase('done')
    } catch (err) {
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'verify'
            ? {
                ...c,
                status: 'fail',
                message: err.message,
                help: 'The tunnel may need a moment to establish. Try again in a few seconds.'
              }
            : c
        )
      )
    }
  }

  const canConfigure = domain.trim() && tunnelToken.trim()

  async function configureDirectRoute() {
    setNetworkMode('direct')
    setPhase('configuring')

    const steps = [
      { id: 'dns', label: 'Check DNS', message: `Resolving ${domain}...` },
      { id: 'configure', label: 'Configure homeserver', message: 'Writing well_known config...' },
      { id: 'verify', label: 'Verify connection', message: `Checking https://${domain}...` }
    ]
    setChecks(steps.map((s) => ({ ...s, status: 'pending' })))

    // Step 1: DNS
    setChecks((prev) =>
      prev.map((c) => (c.id === 'dns' ? { ...c, status: 'checking', message: `Resolving ${domain}...` } : c))
    )
    try {
      const res = await fetch('/api/onboarding/local/networking/check-dns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'dns' ? { ...c, status: 'pass', message: `Resolved to ${data.addresses.join(', ')}` } : c
        )
      )
    } catch (err) {
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'dns'
            ? {
                ...c,
                status: 'fail',
                message: err.message,
                help: 'Configure a DNS A record pointing to your server\u2019s static IP address.'
              }
            : c
        )
      )
      return
    }

    // Step 2: Configure well_known (direct mode)
    setChecks((prev) =>
      prev.map((c) =>
        c.id === 'configure' ? { ...c, status: 'checking', message: 'Configuring well_known and restarting...' } : c
      )
    )
    try {
      const res = await fetch('/api/onboarding/local/networking/configure-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, mode: 'direct' })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'configure' ? { ...c, status: 'pass', message: 'Homeserver configured for direct route' } : c
        )
      )
    } catch (err) {
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'configure'
            ? { ...c, status: 'fail', message: err.message, help: 'Check Docker logs for details.' }
            : c
        )
      )
      return
    }

    // Step 3: Verify
    setChecks((prev) =>
      prev.map((c) => (c.id === 'verify' ? { ...c, status: 'checking', message: `Checking https://${domain}...` } : c))
    )
    try {
      const res = await fetch('/api/onboarding/local/networking/check-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setChecks((prev) =>
          prev.map((c) =>
            c.id === 'verify'
              ? { ...c, status: 'pass', message: `Reachable (${data.versions?.length || 0} API versions)` }
              : c
          )
        )
        setPublicUrl(data.publicUrl)
        setPhase('done')
        return
      }
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'verify'
            ? {
                ...c,
                status: 'fail',
                message: data.error || 'Not reachable via HTTPS',
                help: 'Make sure you have a reverse proxy (e.g. nginx, Caddy) with TLS termination in front of the homeserver, or use a Cloudflare Tunnel instead.'
              }
            : c
        )
      )
    } catch (err) {
      setChecks((prev) =>
        prev.map((c) =>
          c.id === 'verify'
            ? {
                ...c,
                status: 'fail',
                message: err.message,
                help: 'The homeserver may not be reachable from the internet yet. Check your firewall and reverse proxy configuration.'
              }
            : c
        )
      )
    }
  }

  function handleSkip() {
    fetch('/api/onboarding/local/networking/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    dispatch({ type: ACTIONS.NETWORK_SKIPPED })
  }

  function handleComplete(networking) {
    dispatch({ type: ACTIONS.NETWORK_CONFIGURED, networking })
  }

  function handleBack() {
    dispatch({ type: ACTIONS.GO_BACK })
  }

  // Choose phase
  if (phase === 'choose') {
    return (
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Networking</h2>
        <p className="text-gray-600 mb-6">
          Choose how your homeserver should be accessible. You can expose it publicly or keep it local only.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <button
            onClick={handleSkip}
            className="p-4 bg-gray-50 rounded-lg text-left hover:bg-nervur-50 hover:border-nervur-300 border border-gray-200 transition-colors"
          >
            <h3 className="font-semibold text-gray-900">Local only</h3>
            <p className="text-sm text-gray-600 mt-1">
              Your homeserver will only be accessible from this machine. You can configure networking later.
            </p>
          </button>
          <button
            onClick={() => setPhase('direct-domain')}
            className="p-4 bg-gray-50 rounded-lg text-left hover:bg-nervur-50 hover:border-nervur-300 border border-gray-200 transition-colors"
          >
            <h3 className="font-semibold text-gray-900">Direct route</h3>
            <p className="text-sm text-gray-600 mt-1">
              Domain with A record pointing to your server&apos;s static IP. Requires a reverse proxy with TLS.
            </p>
          </button>
          <button
            onClick={() => setPhase('domain')}
            className="p-4 bg-gray-50 rounded-lg text-left hover:bg-nervur-50 hover:border-nervur-300 border border-gray-200 transition-colors"
          >
            <h3 className="font-semibold text-gray-900">Cloudflare Tunnel</h3>
            <p className="text-sm text-gray-600 mt-1">
              Expose your homeserver publicly via a Cloudflare Tunnel. No static IP required.
            </p>
          </button>
        </div>
        <button
          onClick={handleBack}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
      </div>
    )
  }

  // Direct route — domain input + configure
  if (phase === 'direct-domain') {
    const isRunning = checks.some((c) => c.status === 'checking')
    const hasFailure = checks.some((c) => c.status === 'fail')
    const allPending = checks.every((c) => c.status === 'pending') || checks.length === 0

    return (
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Direct Route</h2>
        <p className="text-gray-600 mb-6">
          Enter the domain for your homeserver. The DNS A record must point to your server&apos;s static IP, and you
          need a reverse proxy (nginx, Caddy) with TLS termination.
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          disabled={isRunning}
          placeholder="matrix.example.com"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-nervur-500 focus:border-transparent mb-1 disabled:bg-gray-50 disabled:text-gray-500"
        />
        <p className="text-xs text-gray-500 mb-6">
          Federation will use port 8448. Make sure your reverse proxy forwards both client (443) and federation (8448)
          traffic to the homeserver.
        </p>

        {checks.length > 0 && !allPending && (
          <div className="mb-6 border border-gray-200 rounded-lg divide-y divide-gray-100 px-4">
            {checks
              .filter((c) => c.status !== 'pending')
              .map((check) => (
                <CheckItem key={check.id} check={check} />
              ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setPhase('choose')
              setChecks([])
            }}
            disabled={isRunning}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Back
          </button>
          <button
            onClick={configureDirectRoute}
            disabled={!domain.trim() || isRunning}
            className="flex items-center gap-2 px-6 py-3 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 disabled:opacity-50"
          >
            {isRunning && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {isRunning ? 'Configuring...' : hasFailure ? 'Retry' : 'Configure'}
          </button>
        </div>
      </div>
    )
  }

  // Domain entry phase — probe first before asking for token
  if (phase === 'domain') {
    return (
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Cloudflare Tunnel</h2>
        <p className="text-gray-600 mb-6">
          Enter the domain for your homeserver. We&apos;ll check if a tunnel is already configured.
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          disabled={probing}
          placeholder="matrix.example.com"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-nervur-500 focus:border-transparent mb-1 disabled:bg-gray-50 disabled:text-gray-500"
        />
        <p className="text-xs text-gray-500 mb-6">
          The public hostname for your homeserver. Must have a DNS A record pointing to your server&apos;s static IP, or
          a CNAME managed by Cloudflare. Federation and client connections will use this domain.
        </p>

        {checks.length > 0 && (
          <div className="mb-6 border border-gray-200 rounded-lg divide-y divide-gray-100 px-4">
            {checks.map((check) => (
              <CheckItem key={check.id} check={check} />
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setPhase('choose')
              setChecks([])
            }}
            disabled={probing}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Back
          </button>
          <button
            onClick={probeDomain}
            disabled={!domain.trim() || probing}
            className="flex items-center gap-2 px-6 py-3 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 disabled:opacity-50"
          >
            {probing && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {probing ? 'Checking...' : 'Check Domain'}
          </button>
        </div>
      </div>
    )
  }

  // Tunnel token input phase
  if (phase === 'tunnel-input') {
    const hasFailure = checks.some((c) => c.status === 'fail')
    const isRunning = checks.some((c) => c.status === 'checking')

    return (
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Cloudflare Tunnel</h2>
        <p className="text-gray-600 mb-6">
          No existing tunnel found for <code className="bg-gray-100 px-1 rounded">{domain}</code>. Enter your Cloudflare
          Tunnel token to set one up.
        </p>

        {checks.length > 0 && (
          <div className="mb-6 border border-gray-200 rounded-lg divide-y divide-gray-100 px-4">
            {checks
              .filter((c) => c.status !== 'pending')
              .map((check) => (
                <CheckItem key={check.id} check={check} />
              ))}
          </div>
        )}

        <label className="block text-sm font-medium text-gray-700 mb-1">Tunnel token</label>
        <input
          type="text"
          value={tunnelToken}
          onChange={(e) => setTunnelToken(e.target.value)}
          disabled={isRunning}
          placeholder="eyJhIjoiNTY3..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-nervur-500 focus:border-transparent mb-1 disabled:bg-gray-50 disabled:text-gray-500"
        />
        <p className="text-xs text-gray-500 mb-6">
          Create a tunnel at{' '}
          <a
            href="https://one.dash.cloudflare.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-nervur-600 hover:underline"
          >
            Cloudflare Zero Trust
          </a>{' '}
          and copy the token. Make sure the tunnel routes traffic to{' '}
          <code className="bg-gray-100 px-1 rounded">http://localhost:8008</code> (or your configured port).
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setPhase('domain')
              setChecks([])
            }}
            disabled={isRunning}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Back
          </button>
          <button
            onClick={configureTunnel}
            disabled={!canConfigure || isRunning}
            className="flex items-center gap-2 px-6 py-3 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 disabled:opacity-50"
          >
            {isRunning && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {isRunning ? 'Configuring...' : hasFailure ? 'Retry' : 'Configure Tunnel'}
          </button>
        </div>
      </div>
    )
  }

  // Configuring phase (running the checklist)
  if (phase === 'configuring') {
    const hasFailure = checks.some((c) => c.status === 'fail')
    const isRunning = checks.some((c) => c.status === 'checking')
    const allPending = checks.every((c) => c.status === 'pending') || checks.length === 0

    return (
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Cloudflare Tunnel</h2>
        <p className="text-gray-600 mb-6">
          Configuring tunnel for <code className="bg-gray-100 px-1 rounded">{domain}</code>...
        </p>

        {checks.length > 0 && !allPending && (
          <div className="mb-6 border border-gray-200 rounded-lg divide-y divide-gray-100 px-4">
            {checks
              .filter((c) => c.status !== 'pending')
              .map((check) => (
                <CheckItem key={check.id} check={check} />
              ))}
          </div>
        )}

        {hasFailure && !isRunning && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setPhase(networkMode === 'direct' ? 'direct-domain' : 'tunnel-input')
                setChecks([])
              }}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={configureTunnel}
              disabled={!canConfigure}
              className="px-6 py-3 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    )
  }

  // Done phase
  return (
    <div>
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-6">
        <div className="flex items-center gap-2 mb-2">
          <CheckIcon />
          <p className="text-green-800 font-medium">Tunnel is active</p>
        </div>
        <p className="text-sm text-green-700">
          Your homeserver is publicly reachable at <code className="bg-green-100 px-1 rounded">{publicUrl}</code>
        </p>
      </div>

      {checks.length > 0 && (
        <div className="mb-6 border border-gray-200 rounded-lg divide-y divide-gray-100 px-4">
          {checks.map((check) => (
            <CheckItem key={check.id} check={check} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => { setPhase('choose'); setChecks([]); setPublicUrl(null) }}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={() => handleComplete({ networkMode: 'public', domain, tunnelToken })}
          className="px-6 py-3 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
