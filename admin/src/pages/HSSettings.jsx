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

export default function HSSettings({ config }) {
  const hs = config?.homeserver || {}
  const hasPublicDomain = !!hs.domain

  const [containers, setContainers] = useState(null)
  const [hsAction, setHsAction] = useState('')
  const [regConfig, setRegConfig] = useState(null)
  const [regSaving, setRegSaving] = useState(false)

  useEffect(() => {
    fetchContainerStatus()
    fetchRegConfig()
  }, [])

  const fetchContainerStatus = async () => {
    try {
      const res = await fetch('/api/homeserver/status')
      const data = await res.json()
      if (data.available) setContainers(data)
    } catch {
      /* ignore */
    }
  }

  const containerAction = async (action) => {
    setHsAction(action)
    try {
      const res = await fetch(`/api/homeserver/${action}`, { method: 'POST' })
      const data = await res.json()
      if (data.homeserver) {
        setContainers({ available: true, homeserver: data.homeserver, cloudflared: data.cloudflared })
      } else {
        setTimeout(fetchContainerStatus, 2000)
      }
    } catch {
      setTimeout(fetchContainerStatus, 2000)
    }
    setHsAction('')
  }

  const fetchRegConfig = async () => {
    try {
      const res = await fetch('/api/homeserver/registration-config')
      const data = await res.json()
      if (!data.error) setRegConfig(data)
    } catch {
      /* ignore */
    }
  }

  const setRegMode = async (mode) => {
    if (regSaving || regConfig?.mode === mode) return
    setRegSaving(true)
    try {
      const res = await fetch('/api/homeserver/registration-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      })
      const data = await res.json()
      if (data.success) {
        await fetchRegConfig()
        fetchContainerStatus()
      }
    } catch {
      /* ignore */
    }
    setRegSaving(false)
  }

  const hsRunning = containers?.homeserver?.running
  const hsConfigured = containers?.available
  const cfRunning = containers?.cloudflared?.running
  const hasCloudflared = containers?.cloudflared && containers.cloudflared.status !== 'not_found'

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Homeserver Settings</h1>

      <div className="max-w-3xl space-y-6">
        {/* Container controls */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Containers</h2>
            <div className="flex items-center gap-3">
              {hsRunning ? (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => containerAction('restart')}
                    disabled={!!hsAction}
                    className="px-2.5 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    {hsAction === 'restart' ? 'Restarting...' : 'Restart'}
                  </button>
                  <button
                    onClick={() => containerAction('stop')}
                    disabled={!!hsAction}
                    className="px-2.5 py-1 text-xs border border-red-300 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
                  >
                    {hsAction === 'stop' ? 'Stopping...' : 'Stop'}
                  </button>
                </div>
              ) : hsConfigured ? (
                <button
                  onClick={() => containerAction('start')}
                  disabled={!!hsAction}
                  className="px-2.5 py-1 text-xs bg-nervur-600 text-white rounded-md hover:bg-nervur-700 disabled:opacity-50"
                >
                  {hsAction === 'start' ? 'Starting...' : 'Start'}
                </button>
              ) : null}
            </div>
          </div>

          {containers ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${hsRunning ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-gray-700 font-medium">nervur-homeserver</span>
                </div>
                <span className={`text-xs ${hsRunning ? 'text-green-600' : 'text-red-600'}`}>
                  {containers.homeserver.status}
                </span>
              </div>
              {containers.cloudflared && containers.cloudflared.status !== 'not_found' && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${cfRunning ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className="text-gray-700 font-medium">nervur-cloudflared</span>
                  </div>
                  <span className={`text-xs ${cfRunning ? 'text-green-600' : 'text-gray-400'}`}>
                    {containers.cloudflared?.status || 'not found'}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Spinner />
              <span>Checking containers...</span>
            </div>
          )}
        </div>

        {/* Registration config */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Registration</h2>
          {!regConfig ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Spinner />
              <span>Checking registration...</span>
            </div>
          ) : (
            <div className={`space-y-1 ${regSaving ? 'opacity-50 pointer-events-none' : ''}`}>
              {[
                { mode: 'closed', label: 'Closed', desc: 'No one can register. Only existing users can log in.' },
                { mode: 'token', label: 'Token only', desc: 'Users need a registration token to create an account.' },
                { mode: 'open', label: 'Open', desc: 'Anyone can register an account freely.' }
              ].map(({ mode, label, desc }) => (
                <button
                  key={mode}
                  onClick={() => setRegMode(mode)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors ${
                    regConfig.mode === mode ? 'bg-nervur-50 ring-1 ring-nervur-300' : 'hover:bg-gray-50'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      regConfig.mode === mode ? 'border-nervur-600' : 'border-gray-300'
                    }`}
                  >
                    {regConfig.mode === mode && <span className="w-2 h-2 rounded-full bg-nervur-600" />}
                  </span>
                  <div>
                    <span className="text-sm font-medium text-gray-900">{label}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
              {regSaving && (
                <div className="flex items-center gap-2 text-sm text-gray-400 pt-2">
                  <Spinner />
                  <span>Restarting homeserver...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Server info summary */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Server Configuration</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <span className="text-gray-500">Server name</span>
              <p className="font-mono font-medium text-gray-900">{hs.serverName || '-'}</p>
            </div>
            <div>
              <span className="text-gray-500">URL</span>
              <p className="font-mono font-medium text-gray-900">{hs.url || '-'}</p>
            </div>
            {hasPublicDomain && (
              <>
                <div>
                  <span className="text-gray-500">Public domain</span>
                  <p className="font-mono font-medium text-gray-900">{hs.domain}</p>
                </div>
                <div>
                  <span className="text-gray-500">Network</span>
                  <p className="font-medium text-gray-900">
                    {hasCloudflared ? (
                      <span className={cfRunning ? 'text-green-600' : 'text-gray-400'}>
                        Cloudflare Tunnel ({cfRunning ? 'active' : 'inactive'})
                      </span>
                    ) : (
                      <span className="text-gray-700">Direct</span>
                    )}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
