import { useState, useEffect } from 'react'
import { Spinner, UserCard, DeactivateModal } from '../components/UserComponents.jsx'
import ChatPanel from '../components/ChatPanel.jsx'

export default function TestUsers({ config }) {
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [form, setForm] = useState({ username: '', displayName: '' })
  const [deactivating, setDeactivating] = useState(null)
  const [confirmUser, setConfirmUser] = useState(null)
  const [canCreate, setCanCreate] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)

  const serverName = config?.homeserver?.serverName || ''
  const isLocal = config?.homeserver?.type === 'local'
  const brainUserId = config?.brain?.user_id

  useEffect(() => {
    fetchUsers()
    if (isLocal) {
      setCanCreate(true)
    } else {
      fetch('/api/homeserver/registration-config')
        .then((r) => r.json())
        .then((data) => setCanCreate(data.mode === 'open'))
        .catch(() => setCanCreate(false))
    }
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

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/homeserver/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username, displayName: form.displayName, isTest: true })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setForm({ username: '', displayName: '' })
      setShowCreate(false)
      fetchUsers()
    } catch (err) {
      setCreateError(err.message)
    }
    setCreating(false)
  }

  const handleDeactivate = async (userId) => {
    setConfirmUser(null)
    setDeactivating(userId)
    try {
      const res = await fetch(`/api/homeserver/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (selectedUser?.name === userId) setSelectedUser(null)
      fetchUsers()
    } catch (err) {
      setError(`Failed to deactivate: ${err.message}`)
    }
    setDeactivating(null)
  }

  const handleSelectUser = (user) => {
    if (!user.roomId) return
    setSelectedUser(selectedUser?.name === user.name ? null : user)
  }

  const testUsersAll = (users || []).filter((u) => u.role === 'test')

  const userList = (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Test Users</h1>
          <p className="text-gray-500 text-sm mt-1">Test accounts grouped by brain</p>
        </div>
        <div className="flex items-center gap-2">
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
          {canCreate && (
            <button
              onClick={() => {
                setShowCreate(!showCreate)
                setCreateError(null)
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-nervur-600 text-white rounded-lg text-sm font-medium hover:bg-nervur-700"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {showCreate ? 'Cancel' : 'Create Test User'}
            </button>
          )}
        </div>
      </div>

      {/* Create test user form */}
      {showCreate && (
        <div className="mb-6 bg-white rounded-xl shadow-sm p-6 border-l-4 border-amber-400">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Test User</h2>
          <p className="text-sm text-gray-500 mb-4">
            Test users have auto-derived passwords and are linked to this brain.
          </p>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Username</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">@</span>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="test-alice"
                  required
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nervur-500 focus:border-transparent"
                />
                <span className="text-gray-400 text-sm">:{serverName}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Display Name</label>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Test Alice"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nervur-500 focus:border-transparent"
              />
            </div>
            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{createError}</div>
            )}
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 disabled:opacity-50"
            >
              {creating && <Spinner className="w-4 h-4 !text-white" />}
              {creating ? 'Creating...' : 'Create'}
            </button>
          </form>
        </div>
      )}

      {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {loading && !users ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="w-6 h-6" />
          <span className="ml-3 text-gray-500">Loading test users...</span>
        </div>
      ) : testUsersAll.length === 0 && !showCreate ? (
        <div className="text-center py-20">
          <svg className="mx-auto w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <p className="mt-3 text-gray-500">No test users yet</p>
          <p className="mt-1 text-gray-400 text-sm">Create one to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {testUsersAll.map((user) => (
            <div
              key={user.name}
              onClick={() => handleSelectUser(user)}
              className={`bg-white rounded-xl shadow-sm p-5 border-l-4 transition-colors ${
                selectedUser?.name === user.name
                  ? 'border-nervur-500 ring-2 ring-nervur-200'
                  : 'border-amber-400 hover:border-amber-500'
              } ${user.roomId ? 'cursor-pointer' : ''}`}
            >
              <UserCard user={user} onDeactivate={setConfirmUser} deactivating={deactivating} />
            </div>
          ))}
        </div>
      )}

      <DeactivateModal confirmUser={confirmUser} onCancel={() => setConfirmUser(null)} onConfirm={handleDeactivate} />
    </>
  )

  if (selectedUser?.roomId) {
    return (
      <div className="flex gap-6" style={{ height: 'calc(100vh - 7rem)' }}>
        <div className="w-1/2 overflow-y-auto">{userList}</div>
        <div className="w-1/2">
          <ChatPanel
            roomId={selectedUser.roomId}
            roomName={selectedUser.displayname || selectedUser.name}
            brainUserId={brainUserId}
            sendAsUserId={selectedUser.name}
            onClose={() => setSelectedUser(null)}
          />
        </div>
      </div>
    )
  }

  return <div>{userList}</div>
}
