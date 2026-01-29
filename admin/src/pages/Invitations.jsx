import { useState, useEffect, useRef } from 'react'

const Spinner = ({ className = 'w-4 h-4' }) => (
  <svg className={`animate-spin text-nervur-500 ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

export default function Invitations() {
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [acting, setActing] = useState({})
  const [live, setLive] = useState(false)
  const esRef = useRef(null)

  const fetchInvitations = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/brain/invitations')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setInvitations(data.invitations || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // SSE connection for real-time updates
  useEffect(() => {
    fetchInvitations()

    const es = new EventSource('/api/brain/events')
    esRef.current = es

    es.addEventListener('connected', () => setLive(true))

    es.addEventListener('invitations', (e) => {
      try {
        const data = JSON.parse(e.data)
        setInvitations(data.invitations || [])
      } catch {}
    })

    es.onerror = () => {
      setLive(false)
      // EventSource auto-reconnects
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [])

  const handleAction = async (roomId, action) => {
    setActing(prev => ({ ...prev, [roomId]: action === 'accept' ? 'accepting' : 'rejecting' }))
    try {
      const res = await fetch(`/api/brain/invitations/${encodeURIComponent(roomId)}/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setInvitations(prev => prev.filter(inv => inv.roomId !== roomId))
    } catch (err) {
      setError(`Failed to ${action}: ${err.message}`)
    } finally {
      setActing(prev => {
        const next = { ...prev }
        delete next[roomId]
        return next
      })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invitations</h1>
          <p className="text-gray-500 text-sm mt-1">
            Pending room invitations for the brain
            {live && (
              <span className="inline-flex items-center gap-1.5 ml-3">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-600 text-xs font-medium">Live</span>
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchInvitations}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Spinner /> : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && invitations.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="w-6 h-6" />
          <span className="ml-3 text-gray-500">Loading invitations...</span>
        </div>
      ) : invitations.length === 0 ? (
        <div className="text-center py-20">
          <svg className="mx-auto w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="mt-3 text-gray-500">No pending invitations</p>
          {live && <p className="mt-1 text-xs text-gray-400">Listening for new invitations...</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {invitations.map((inv) => {
            const actionState = acting[inv.roomId]
            const ActionButtons = (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleAction(inv.roomId, 'reject')}
                  disabled={!!actionState}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {actionState === 'rejecting' ? <Spinner /> : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  Deny
                </button>
                <button
                  onClick={() => handleAction(inv.roomId, 'accept')}
                  disabled={!!actionState}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-nervur-600 text-white rounded-lg text-sm font-medium hover:bg-nervur-700 disabled:opacity-50"
                >
                  {actionState === 'accepting' ? <Spinner className="w-4 h-4 !text-white" /> : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  Accept
                </button>
              </div>
            )

            if (inv.isDirect) {
              // DM: person-centric layout
              return (
                <div key={inv.roomId} className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-blue-400">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        {inv.inviterDisplayName && (
                          <h3 className="font-semibold text-gray-900 truncate">
                            {inv.inviterDisplayName}
                          </h3>
                        )}
                        <p className={`font-mono truncate ${inv.inviterDisplayName ? 'text-xs text-gray-400 mt-0.5' : 'font-semibold text-gray-900'}`}>
                          {inv.inviter || 'Unknown'}
                        </p>
                        {!inv.inviterDisplayName && (
                          <p className="text-xs text-gray-400 mt-0.5">Direct message</p>
                        )}
                        {inv.reason && (
                          <p className="text-sm text-gray-500 mt-1 italic truncate">&ldquo;{inv.reason}&rdquo;</p>
                        )}
                      </div>
                    </div>
                    {ActionButtons}
                  </div>
                </div>
              )
            }

            // Room invite
            return (
              <div key={inv.roomId} className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-nervur-400">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-nervur-100 text-nervur-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {inv.roomName || 'Unnamed Room'}
                        </h3>
                        <span className="font-mono text-xs text-gray-400 truncate shrink-0">
                          {inv.roomAlias || inv.roomId}
                        </span>
                      </div>
                      {inv.reason && (
                        <p className="text-sm text-gray-500 mt-0.5 italic truncate">&ldquo;{inv.reason}&rdquo;</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        {inv.inviter && (
                          <>invited by {inv.inviterDisplayName && <span className="text-gray-500">{inv.inviterDisplayName} </span>}<span className="font-mono text-gray-500">{inv.inviter}</span></>
                        )}
                        {inv.creator && inv.creator !== inv.inviter && (
                          <>{inv.inviter && <span className="mx-1.5">&middot;</span>}created by <span className="font-mono">{inv.creator}</span></>
                        )}
                      </p>
                    </div>
                  </div>
                  {ActionButtons}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
