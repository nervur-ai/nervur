import { useState, useEffect } from 'react'
import { Spinner, BrainCard, DeactivateModal } from '../components/UserComponents.jsx'

export default function Brains({ config }) {
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deactivating, setDeactivating] = useState(null)
  const [confirmUser, setConfirmUser] = useState(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/homeserver/users')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setUsers(data.users || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeactivate = async (userId) => {
    setConfirmUser(null)
    setDeactivating(userId)
    try {
      const res = await fetch(`/api/homeserver/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      fetchUsers()
    } catch (err) {
      setError(`Failed to deactivate: ${err.message}`)
    }
    setDeactivating(null)
  }

  // Remote brains only (exclude self)
  const brains = (users || []).filter((u) => u.role === 'brain' && !u.isSelf)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Remote Brains</h1>
          <p className="text-gray-500 text-sm mt-1">Brain accounts that connected to this homeserver</p>
        </div>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? (
            <Spinner />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          )}
          Refresh
        </button>
      </div>

      {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {loading && !users ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="w-6 h-6" />
          <span className="ml-3 text-gray-500">Loading brains...</span>
        </div>
      ) : brains.length === 0 ? (
        <div className="text-center py-20">
          <svg className="mx-auto w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <p className="mt-3 text-gray-500">No remote brains connected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {brains.map((brain) => (
            <BrainCard
              key={brain.name}
              brain={brain}
              testUsers={[]}
              onDeactivate={setConfirmUser}
              deactivating={deactivating}
            />
          ))}
        </div>
      )}

      <DeactivateModal confirmUser={confirmUser} onCancel={() => setConfirmUser(null)} onConfirm={handleDeactivate} />
    </div>
  )
}
