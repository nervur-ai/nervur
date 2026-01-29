import { useState, useEffect } from 'react'

const Spinner = ({ className = 'w-4 h-4' }) => (
  <svg className={`animate-spin text-nervur-500 ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

export default function Users({ config }) {
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [form, setForm] = useState({ username: '', password: '', displayName: '' })
  const [deactivating, setDeactivating] = useState(null)
  const [confirmUser, setConfirmUser] = useState(null)

  const serverName = config?.homeserver?.serverName || ''

  useEffect(() => { fetchUsers() }, [])

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
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setForm({ username: '', password: '', displayName: '' })
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
      fetchUsers()
    } catch (err) {
      setError(`Failed to deactivate: ${err.message}`)
    }
    setDeactivating(null)
  }

  const generatePassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let pw = ''
    for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)]
    setForm(f => ({ ...f, password: pw }))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 text-sm mt-1">
            Accounts on your homeserver
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
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
          <button
            onClick={() => { setShowCreate(!showCreate); setCreateError(null) }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-nervur-600 text-white rounded-lg text-sm font-medium hover:bg-nervur-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {showCreate ? 'Cancel' : 'Create User'}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 bg-white rounded-xl shadow-sm p-6 border-l-4 border-nervur-400">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Account</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Username</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">@</span>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="alice"
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
                onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                placeholder="Alice"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nervur-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Password</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-nervur-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={generatePassword}
                  className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Generate
                </button>
              </div>
            </div>
            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {createError}
              </div>
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

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !users ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="w-6 h-6" />
          <span className="ml-3 text-gray-500">Loading users...</span>
        </div>
      ) : !users || users.length === 0 ? (
        <div className="text-center py-20">
          <svg className="mx-auto w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="mt-3 text-gray-500">No users found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map(user => {
            const isAdmin = user.admin
            const isDeactivated = user.deactivated
            const borderColor = isDeactivated ? 'border-gray-300' : isAdmin ? 'border-nervur-400' : 'border-green-400'

            return (
              <div key={user.name} className={`bg-white rounded-xl shadow-sm p-5 border-l-4 ${borderColor}`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      isDeactivated ? 'bg-gray-100 text-gray-400' : isAdmin ? 'bg-nervur-100 text-nervur-600' : 'bg-green-100 text-green-600'
                    }`}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {user.displayname || user.name}
                        </h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isDeactivated
                            ? 'bg-gray-100 text-gray-500'
                            : isAdmin
                              ? 'bg-nervur-100 text-nervur-700'
                              : 'bg-green-100 text-green-700'
                        }`}>
                          {isDeactivated ? 'Deactivated' : isAdmin ? 'Admin' : 'Active'}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-gray-400 mt-0.5 truncate">{user.name}</p>
                    </div>
                  </div>
                  {!isDeactivated && !isAdmin && (
                    <button
                      onClick={() => setConfirmUser(user)}
                      disabled={deactivating === user.name}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                    >
                      {deactivating === user.name ? <Spinner /> : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      )}
                      {deactivating === user.name ? 'Deactivating...' : 'Deactivate'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Deactivate confirmation modal */}
      {confirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmUser(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Deactivate account</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Are you sure you want to deactivate <span className="font-medium text-gray-900">{confirmUser.displayname || confirmUser.name}</span>?
                </p>
                <p className="mt-1 text-sm text-gray-500 font-mono">{confirmUser.name}</p>
                <p className="mt-3 text-sm text-red-600">
                  This action cannot be undone. The account will be permanently disabled and the username cannot be reused.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmUser(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeactivate(confirmUser.name)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
