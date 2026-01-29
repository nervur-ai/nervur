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

export default function BrainRooms({ config }) {
  const [rooms, setRooms] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [members, setMembers] = useState({})
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [form, setForm] = useState({ name: '', topic: '' })
  const [inviteForm, setInviteForm] = useState({ roomId: null, userId: '' })
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState(null)

  const serverName = config?.homeserver?.serverName || ''
  const brainUserId = config?.brain?.user_id || ''

  useEffect(() => {
    fetchRooms()
  }, [])

  const fetchRooms = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/brain/rooms')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRooms(data.rooms || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleRoom = async (roomId) => {
    if (expanded === roomId) {
      setExpanded(null)
      return
    }
    setExpanded(roomId)
    setInviteForm({ roomId: null, userId: '' })
    setInviteError(null)
    if (!members[roomId]) {
      try {
        const res = await fetch(`/api/homeserver/rooms/${encodeURIComponent(roomId)}/members`)
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setMembers((m) => ({ ...m, [roomId]: data.members }))
      } catch {
        setMembers((m) => ({ ...m, [roomId]: [] }))
      }
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/homeserver/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setForm({ name: '', topic: '' })
      setShowCreate(false)
      fetchRooms()
    } catch (err) {
      setCreateError(err.message)
    }
    setCreating(false)
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviting(true)
    setInviteError(null)
    try {
      const res = await fetch(`/api/homeserver/rooms/${encodeURIComponent(inviteForm.roomId)}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: inviteForm.userId })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const refreshRoomId = inviteForm.roomId
      setInviteForm({ roomId: null, userId: '' })
      setMembers((m) => ({ ...m, [refreshRoomId]: null }))
      const mRes = await fetch(`/api/homeserver/rooms/${encodeURIComponent(refreshRoomId)}/members`)
      const mData = await mRes.json()
      setMembers((m) => ({ ...m, [refreshRoomId]: mData.members || [] }))
      fetchRooms()
    } catch (err) {
      setInviteError(err.message)
    }
    setInviting(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Roles</h1>
          <p className="text-gray-500 text-sm mt-1">Rooms where the brain and other identities interact</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRooms}
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
            {showCreate ? 'Cancel' : 'Create Role'}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-6 bg-white rounded-xl shadow-sm p-6 border-l-4 border-nervur-400">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Role</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Room name"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nervur-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Topic (optional)</label>
              <input
                type="text"
                value={form.topic}
                onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                placeholder="What's this room about?"
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

      {loading && !rooms ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="w-6 h-6" />
          <span className="ml-3 text-gray-500">Loading rooms...</span>
        </div>
      ) : !rooms || rooms.length === 0 ? (
        <div className="text-center py-20">
          <svg className="mx-auto w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
            />
          </svg>
          <p className="mt-3 text-gray-500">No roles yet</p>
          <p className="mt-1 text-gray-400 text-sm">Create one to get started</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(() => {
            const nonSystemRooms = rooms.filter((r) => {
              const name = r.name || ''
              return !name.includes('Admin Room') && !name.startsWith('Skill: ') && !name.startsWith('Test: ')
            })
            const activeRoles = nonSystemRooms.filter((r) => (r.num_other_members ?? 0) > 0)
            const emptyRoles = nonSystemRooms.filter((r) => (r.num_other_members ?? 0) === 0)

            const renderRoom = (room) => {
              const isExpanded = expanded === room.room_id
              const otherMembers = room.num_other_members ?? 0
              const brainAlone = otherMembers === 0
              const borderColor = brainAlone
                ? 'border-gray-300'
                : room.brainIsOwner
                  ? 'border-green-400'
                  : 'border-red-400'

              return (
                <div
                  key={room.room_id}
                  className={`bg-white rounded-xl shadow-sm border-l-4 ${borderColor} transition-all`}
                >
                  <div
                    className="flex items-center justify-between gap-4 p-5 cursor-pointer hover:bg-gray-50/50 rounded-xl"
                    onClick={() => toggleRoom(room.room_id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          brainAlone
                            ? 'bg-gray-100 text-gray-400'
                            : room.brainIsOwner
                              ? 'bg-green-100 text-green-600'
                              : 'bg-red-100 text-red-600'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{room.name || 'Unnamed room'}</h3>
                        <p className="font-mono text-xs text-gray-400 mt-0.5 truncate">{room.room_id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {otherMembers > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          {otherMembers}
                        </span>
                      )}
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-0 border-t border-gray-100">
                    {room.topic && <p className="text-sm text-gray-500 mt-3 mb-3 italic">{room.topic}</p>}

                    {(() => {
                      const roomMembers = (members[room.room_id] || []).filter((m) => m.user_id !== brainUserId)
                      if (!members[room.room_id])
                        return (
                          <div className="mt-3 flex items-center gap-2 text-sm text-gray-400 py-2">
                            <Spinner className="w-3.5 h-3.5" />
                            <span>Loading members...</span>
                          </div>
                        )
                      if (roomMembers.length > 0)
                        return (
                          <div className="mt-3">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Members</h4>
                            <div className="space-y-1.5">
                              {roomMembers.map((m) => (
                                <div key={m.user_id} className="flex items-center gap-2 text-sm">
                                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                                    <div className="w-2 h-2 rounded-full bg-green-400" />
                                  </div>
                                  <span className="text-gray-700 font-medium">{m.displayname}</span>
                                  {m.displayname !== m.user_id && (
                                    <span className="font-mono text-xs text-gray-400">{m.user_id}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      return null
                    })()}

                    <div className={`${(members[room.room_id] || []).filter((m) => m.user_id !== brainUserId).length > 0 ? 'mt-4 pt-3 border-t border-gray-100' : 'mt-3'}`}>
                      {inviteForm.roomId === room.room_id ? (
                        <form onSubmit={handleInvite} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={inviteForm.userId}
                              onChange={(e) => setInviteForm((f) => ({ ...f, userId: e.target.value }))}
                              placeholder={`@user:${serverName}`}
                              required
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-nervur-500 focus:border-transparent"
                            />
                            <button
                              type="submit"
                              disabled={inviting}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 disabled:opacity-50"
                            >
                              {inviting && <Spinner className="w-3.5 h-3.5 !text-white" />}
                              {inviting ? 'Inviting...' : 'Invite'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setInviteForm({ roomId: null, userId: '' })
                                setInviteError(null)
                              }}
                              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                          {inviteError && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                              {inviteError}
                            </div>
                          )}
                        </form>
                      ) : (
                        <button
                          onClick={() => {
                            setInviteForm({ roomId: room.room_id, userId: '' })
                            setInviteError(null)
                          }}
                          className="inline-flex items-center gap-1.5 text-sm text-nervur-600 hover:text-nervur-800 font-medium"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                            />
                          </svg>
                          Invite user
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              )
            }

            return (
              <>
                {activeRoles.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Active Roles</h2>
                    <div className="space-y-3">
                      {activeRoles.map(renderRoom)}
                    </div>
                  </div>
                )}
                {emptyRoles.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Empty Roles</h2>
                    <div className="space-y-3">
                      {emptyRoles.map(renderRoom)}
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
