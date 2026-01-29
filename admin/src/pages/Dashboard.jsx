import { useState, useEffect } from 'react'

const Spinner = ({ className = 'w-4 h-4' }) => (
  <svg className={`animate-spin text-nervur-500 ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
)

export default function Dashboard({ config }) {
  const [hsCheck, setHsCheck] = useState({ status: null })
  const [containerStatus, setContainerStatus] = useState(null)

  const hs = config?.homeserver || {}
  const brain = config?.brain || {}
  const isLocal = hs.type === 'local'
  const hasPublicDomain = !!hs.domain

  useEffect(() => {
    checkHealth()
    if (isLocal) fetchContainerStatus()
  }, [])

  const checkHealth = async () => {
    setHsCheck({ status: 'checking' })
    try {
      const url = encodeURIComponent(hs.url)
      const res = await fetch(`/api/homeserver/check?url=${url}`)
      const data = await res.json()
      setHsCheck(data.ok ? { status: 'ok', versions: data.versions } : { status: 'error', message: data.error })
    } catch {
      setHsCheck({ status: 'error', message: 'Failed to reach backend' })
    }
  }

  const fetchContainerStatus = async () => {
    try {
      const res = await fetch('/api/homeserver/status')
      const data = await res.json()
      if (data.available) setContainerStatus(data)
    } catch {
      /* ignore */
    }
  }

  const hsRunning = containerStatus?.homeserver?.running
  const cfRunning = containerStatus?.cloudflared?.running

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{brain.name || 'Nervur Brain'}</h1>
          <p className="text-gray-500 text-sm mt-1 font-mono">{brain.user_id}</p>
        </div>
        <div className="flex items-center gap-2">
          {hsCheck.status === 'checking' ? (
            <Spinner />
          ) : hsCheck.status === 'ok' ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="text-sm text-gray-600">Connected</span>
            </>
          ) : (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-sm text-red-600">Disconnected</span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Homeserver */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">Homeserver</p>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                hsCheck.status === 'ok'
                  ? 'bg-green-100 text-green-700'
                  : hsCheck.status === 'error'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  hsCheck.status === 'ok' ? 'bg-green-500' : hsCheck.status === 'error' ? 'bg-red-500' : 'bg-gray-400'
                }`}
              />
              {hsCheck.status === 'ok' ? 'Healthy' : hsCheck.status === 'error' ? 'Down' : 'Checking'}
            </span>
          </div>
          <p className="font-mono font-medium text-gray-900 text-sm">{hs.serverName || '-'}</p>
          <p className="font-mono text-xs text-gray-400 mt-0.5">{hs.url}</p>
        </div>

        {/* Network */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-3">Network</p>
          <p className="font-medium text-gray-900 text-sm">
            {!isLocal
              ? 'Remote'
              : containerStatus?.cloudflared && containerStatus.cloudflared.status !== 'not_found'
                ? 'Cloudflare Tunnel'
                : hasPublicDomain
                  ? 'Public (Direct)'
                  : 'Local only'}
          </p>
          {isLocal && containerStatus && (
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-xs ${hsRunning ? 'text-green-600' : 'text-red-600'}`}>
                HS {hsRunning ? 'running' : 'stopped'}
              </span>
              {containerStatus.cloudflared && containerStatus.cloudflared.status !== 'not_found' && (
                <span className={`text-xs ${cfRunning ? 'text-green-600' : 'text-gray-400'}`}>
                  Tunnel {cfRunning ? 'running' : 'stopped'}
                </span>
              )}
            </div>
          )}
          {hasPublicDomain && <p className="font-mono text-xs text-gray-400 mt-0.5">{hs.domain}</p>}
        </div>

        {/* Brain */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-3">Brain</p>
          <p className="font-medium text-gray-900 text-sm">{brain.username || '-'}</p>
          <p className="font-mono text-xs text-gray-400 mt-0.5">Device: {brain.device_id}</p>
        </div>
      </div>
    </div>
  )
}
