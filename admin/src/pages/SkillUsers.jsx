import { useState, useEffect, lazy, Suspense } from 'react'
import { Spinner, DeactivateModal } from '../components/UserComponents.jsx'
import ChatPanel from '../components/ChatPanel.jsx'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

// ── Create Skill Modal ──

function CreateSkillModal({ serverName, onClose, onCreated }) {
  const [tab, setTab] = useState('internal')
  const [form, setForm] = useState({ username: '', displayName: '', description: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [createdPassword, setCreatedPassword] = useState(null)

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/homeserver/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          displayName: form.displayName,
          isSkill: true,
          skillType: tab
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (tab === 'external' && data.access_token) {
        // Show derived password info for external skills
        setCreatedPassword(data.access_token)
      } else {
        onCreated()
      }
    } catch (err) {
      setError(err.message)
    }
    setCreating(false)
  }

  if (createdPassword) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => { onCreated() }} />
        <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">External Skill Created</h3>
          <p className="text-sm text-gray-600 mb-3">
            Save this access token now. It will not be shown again.
          </p>
          <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs break-all text-gray-800 border border-gray-200">
            {createdPassword}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            User ID: <span className="font-mono">@{form.username}:{serverName}</span>
          </p>
          <div className="flex justify-end mt-4">
            <button
              onClick={() => onCreated()}
              className="px-4 py-2 text-sm font-medium text-white bg-nervur-600 rounded-lg hover:bg-nervur-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Skill</h3>

        {/* Sub-tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
          {['internal', 'external'].map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null) }}
              className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'internal' ? 'Internal' : 'External'}
            </button>
          ))}
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {tab === 'internal'
            ? 'Internal skills run on the brain. Code is managed here.'
            : 'External skills are self-hosted. You will receive an access token after creation.'}
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
                placeholder="skill-search"
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
              placeholder="Web Search"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nervur-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What does this skill do?"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nervur-500 focus:border-transparent resize-none"
            />
          </div>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 disabled:opacity-50"
            >
              {creating && <Spinner className="w-4 h-4 !text-white" />}
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Skill Type Badge ──

function SkillTypeBadge({ skillType }) {
  const isInternal = skillType === 'internal'
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        isInternal ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
      }`}
    >
      {isInternal ? 'Internal' : 'External'}
    </span>
  )
}

// ── Code Tab ──

function CodeTab({ userId, skillType }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/skills/${encodeURIComponent(userId)}/code`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setCode(data.code || '')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [userId])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(userId)}/code`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  if (skillType !== 'internal') {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        <div className="text-center">
          <svg className="mx-auto w-10 h-10 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <p>External skills are self-hosted</p>
          <p className="text-gray-400 text-xs mt-1">Code is not managed here</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner className="w-5 h-5" />
        <span className="ml-2 text-gray-400 text-sm">Loading code...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-xs text-gray-500 font-mono">index.js</span>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-nervur-600 text-white rounded-md hover:bg-nervur-700 disabled:opacity-50"
          >
            {saving ? <Spinner className="w-3 h-3 !text-white" /> : null}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      <div className="flex-1" style={{ minHeight: 0 }}>
        <Suspense fallback={
          <div className="flex items-center justify-center py-10">
            <Spinner className="w-5 h-5" />
            <span className="ml-2 text-gray-400 text-sm">Loading editor...</span>
          </div>
        }>
          <MonacoEditor
            height="100%"
            language="javascript"
            theme="vs-dark"
            value={code}
            onChange={(val) => setCode(val || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true
            }}
          />
        </Suspense>
      </div>
    </div>
  )
}

// ── Settings Tab ──

function SettingsTab({ userId, onDeactivate }) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/skills/${encodeURIComponent(userId)}/state`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setState(data)
        setDescription(data.description || '')
        setTags(Array.isArray(data.tags) ? data.tags.join(', ') : data.tags || '')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [userId])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const tagsArray = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const res = await fetch(`/api/skills/${encodeURIComponent(userId)}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, tags: tagsArray })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner className="w-5 h-5" />
        <span className="ml-2 text-gray-400 text-sm">Loading settings...</span>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-5 overflow-y-auto" style={{ maxHeight: '100%' }}>
      {/* Read-only fields */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">User ID</label>
          <p className="font-mono text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{userId}</p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Skill Type</label>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 capitalize">{state?.skillType || 'internal'}</p>
        </div>
        {state?.intents && state.intents.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Known Intents</label>
            <div className="flex flex-wrap gap-1.5">
              {state.intents.map((intent) => (
                <span key={intent} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-mono">
                  {intent}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <hr className="border-gray-200" />

      {/* Editable fields */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What does this skill do?"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nervur-500 focus:border-transparent resize-none"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Tags</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="search, web, api"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nervur-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-400 mt-1">Comma-separated</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 disabled:opacity-50"
          >
            {saving && <Spinner className="w-4 h-4 !text-white" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saved && <span className="text-sm text-green-600 font-medium">Saved</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Danger zone */}
      <div>
        <h4 className="text-sm font-medium text-red-600 mb-2">Danger Zone</h4>
        <button
          onClick={() => onDeactivate()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-300 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
          Deactivate Skill
        </button>
      </div>
    </div>
  )
}

// ── Main Component ──

export default function SkillUsers({ config }) {
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deactivating, setDeactivating] = useState(null)
  const [confirmUser, setConfirmUser] = useState(null)
  const [canCreate, setCanCreate] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [activeTab, setActiveTab] = useState('messages')

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
    if (selectedUser?.name === user.name) {
      setSelectedUser(null)
    } else {
      setSelectedUser(user)
      setActiveTab('messages')
    }
  }

  const skillUsersAll = (users || []).filter((u) => u.role === 'skill')

  const tabs = [
    { id: 'messages', label: 'Messages' },
    { id: 'code', label: 'Code' },
    { id: 'settings', label: 'Settings' }
  ]

  return (
    <div className="flex gap-6" style={{ height: 'calc(100vh - 7rem)' }}>
      {/* Left panel — Skill list */}
      <div className={`${selectedUser ? 'w-1/3' : 'w-full'} overflow-y-auto transition-all`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Skills</h1>
            <p className="text-gray-500 text-sm mt-1">Skill accounts linked to this brain</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
            </button>
            {canCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-nervur-600 text-white rounded-lg text-sm font-medium hover:bg-nervur-700"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Skill
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {loading && !users ? (
          <div className="flex items-center justify-center py-20">
            <Spinner className="w-6 h-6" />
            <span className="ml-3 text-gray-500">Loading skills...</span>
          </div>
        ) : skillUsersAll.length === 0 ? (
          <div className="text-center py-20">
            <svg className="mx-auto w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <p className="mt-3 text-gray-500">No skills yet</p>
            <p className="mt-1 text-gray-400 text-sm">Create one to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {skillUsersAll.map((user) => (
              <div
                key={user.name}
                onClick={() => handleSelectUser(user)}
                className={`bg-white rounded-xl shadow-sm p-4 border-l-4 transition-colors cursor-pointer ${
                  selectedUser?.name === user.name
                    ? 'border-nervur-500 ring-2 ring-nervur-200'
                    : 'border-purple-400 hover:border-purple-500'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate text-sm">
                        {user.displayname || user.name}
                      </h3>
                      <SkillTypeBadge skillType={user.skillType || 'internal'} />
                    </div>
                    <p className="font-mono text-xs text-gray-400 mt-0.5 truncate">{user.name}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right panel — Detail view */}
      {selectedUser?.roomId && (
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden" style={{ minWidth: 0 }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 truncate">
                  {selectedUser.displayname || selectedUser.name}
                </h3>
                <SkillTypeBadge skillType={selectedUser.skillType || 'internal'} />
              </div>
              <p className="font-mono text-xs text-gray-400 truncate">{selectedUser.name}</p>
            </div>
            <button
              onClick={() => setSelectedUser(null)}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-nervur-500 text-nervur-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1" style={{ minHeight: 0 }}>
            {activeTab === 'messages' && (
              <ChatPanel
                roomId={selectedUser.roomId}
                roomName={selectedUser.displayname || selectedUser.name}
                brainUserId={brainUserId}
                onClose={() => setSelectedUser(null)}
                readOnly
                hideHeader
              />
            )}
            {activeTab === 'code' && (
              <CodeTab userId={selectedUser.name} skillType={selectedUser.skillType || 'internal'} />
            )}
            {activeTab === 'settings' && (
              <SettingsTab
                userId={selectedUser.name}
                onDeactivate={() => setConfirmUser(selectedUser)}
              />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateSkillModal
          serverName={serverName}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            fetchUsers()
          }}
        />
      )}

      <DeactivateModal
        confirmUser={confirmUser}
        onCancel={() => setConfirmUser(null)}
        onConfirm={handleDeactivate}
      />
    </div>
  )
}
