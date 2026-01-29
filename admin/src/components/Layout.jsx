import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

function HomeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  )
}

function InboxIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  )
}

function ServerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
      />
    </svg>
  )
}

function CogIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

function RoomsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
      />
    </svg>
  )
}

function TestUsersIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  )
}

const hsSubLinks = [
  { name: 'Settings', href: '/homeserver/settings' },
  { name: 'Remote Brains', href: '/homeserver/brains' },
  { name: 'Human Users', href: '/homeserver/users' },
  { name: 'Other Rooms', href: '/homeserver/rooms' }
]

function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
  }
  return 0
}

const themes = {
  remote: {
    aside: 'bg-nervur-900',
    header: 'text-nervur-400',
    badge: 'bg-nervur-800',
    badgeText: 'text-nervur-400',
    active: 'bg-nervur-700 text-white',
    inactive: 'text-nervur-300 hover:bg-nervur-800 hover:text-white',
    subActive: 'text-white bg-nervur-600',
    subInactive: 'text-nervur-400 hover:text-white hover:bg-nervur-800',
    border: 'border-nervur-800',
    switchBg: 'bg-nervur-800',
    switchActive: 'bg-nervur-600 text-white shadow-sm font-medium',
    switchInactive: 'text-nervur-400 hover:text-nervur-200',
    versionText: 'text-nervur-500',
    switchLabel: 'text-nervur-500'
  },
  local: {
    aside: 'bg-emerald-950',
    header: 'text-emerald-400',
    badge: 'bg-emerald-900',
    badgeText: 'text-emerald-400',
    active: 'bg-emerald-800 text-white',
    inactive: 'text-emerald-300 hover:bg-emerald-900 hover:text-white',
    subActive: 'text-white bg-emerald-700',
    subInactive: 'text-emerald-400 hover:text-white hover:bg-emerald-900',
    border: 'border-emerald-900',
    switchBg: 'bg-emerald-900',
    switchActive: 'bg-emerald-700 text-white shadow-sm font-medium',
    switchInactive: 'text-emerald-400 hover:text-emerald-200',
    versionText: 'text-emerald-500',
    switchLabel: 'text-emerald-500'
  }
}

function RegistrationSwitch({ isLocal, t }) {
  const [mode, setMode] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isLocal) return
    fetch('/api/homeserver/registration-config')
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setMode(d.mode)
      })
      .catch(() => {})
  }, [isLocal])

  if (!isLocal || !mode) return null

  const options = [
    { value: 'closed', label: 'Closed' },
    { value: 'token', label: 'Token' },
    { value: 'open', label: 'Open' }
  ]

  const handleChange = async (newMode) => {
    if (saving || mode === newMode) return
    setSaving(true)
    try {
      const res = await fetch('/api/homeserver/registration-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      })
      const data = await res.json()
      if (data.success) setMode(newMode)
    } catch {
      /* ignore */
    }
    setSaving(false)
  }

  return (
    <div className={`${saving ? 'opacity-50 pointer-events-none' : ''}`}>
      <p className={`${t.switchLabel} text-[10px] uppercase tracking-wider mb-1.5`}>Registration</p>
      <div className={`flex rounded-md ${t.switchBg} p-0.5`}>
        {options.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleChange(value)}
            className={`flex-1 text-[11px] py-1 rounded transition-all ${
              mode === value ? t.switchActive : t.switchInactive
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Layout({ children, config }) {
  const location = useLocation()
  const isLocal = config?.homeserver?.type === 'local'
  const brainName = config?.brain?.name
  const brainUserId = config?.brain?.user_id
  const t = isLocal ? themes.local : themes.remote
  const hsActive = location.pathname.startsWith('/homeserver')

  const [version, setVersion] = useState(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetch('/api/version')
      .then((r) => r.json())
      .then(setVersion)
      .catch(() => {})
  }, [])

  const hasUpdate = version?.latest && compareVersions(version.current, version.latest) < 0

  const triggerUpdate = async () => {
    if (updating) return
    setUpdating(true)
    try {
      await fetch('/api/update', { method: 'POST' })
    } catch {
      /* ignore */
    }
    // Container will restart — poll until it's back
    const poll = setInterval(async () => {
      try {
        const r = await fetch('/api/version')
        if (r.ok) {
          clearInterval(poll)
          window.location.reload()
        }
      } catch {
        /* ignore */
      }
    }, 3000)
  }

  return (
    <div className="min-h-screen flex">
      <aside className={`w-64 ${t.aside} text-white flex flex-col`}>
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight">NERVUR</h1>
          <p className={`${t.header} text-sm mt-0.5`}>AI Workforce Platform</p>
          {brainName && (
            <div className={`mt-3 px-3 py-1.5 ${t.badge} rounded-md`}>
              <p className="text-white text-sm font-semibold truncate">{brainName}</p>
              {brainUserId && <p className={`${t.badgeText} text-xs truncate mt-0.5`}>{brainUserId}</p>}
            </div>
          )}
        </div>
        <nav className="flex-1 px-4">
          {/* Dashboard */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${isActive ? t.active : t.inactive}`
            }
          >
            <HomeIcon />
            Dashboard
          </NavLink>

          {/* Invitations */}
          <NavLink
            to="/invitations"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${isActive ? t.active : t.inactive}`
            }
          >
            <InboxIcon />
            Invitations
          </NavLink>

          {/* Test Users */}
          {isLocal && (
            <NavLink
              to="/test-users"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                  isActive ? t.active : t.inactive
                }`
              }
            >
              <TestUsersIcon />
              Test Users
            </NavLink>
          )}

          {/* Rooms */}
          <NavLink
            to="/rooms"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${isActive ? t.active : t.inactive}`
            }
          >
            <RoomsIcon />
            Rooms
          </NavLink>

          {/* Homeserver — expandable sub-nav for local only, hidden for remote */}
          {isLocal && (
            <div className="mb-1">
              <NavLink
                to="/homeserver/settings"
                className={() =>
                  `flex items-center justify-between gap-3 px-4 py-3 rounded-lg transition-colors ${
                    hsActive ? t.active : t.inactive
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <ServerIcon />
                  Homeserver
                </div>
                <ChevronIcon open={hsActive} />
              </NavLink>
              {hsActive && (
                <div className="ml-8 mt-0.5 space-y-0.5">
                  {hsSubLinks.map((item) => (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      end
                      className={({ isActive }) =>
                        `block px-3 py-1.5 rounded-md text-sm transition-colors ${
                          isActive ? t.subActive : t.subInactive
                        }`
                      }
                    >
                      {item.name}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Settings */}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${isActive ? t.active : t.inactive}`
            }
          >
            <CogIcon />
            Settings
          </NavLink>
        </nav>
        <div className={`p-4 border-t ${t.border} space-y-3`}>
          <RegistrationSwitch isLocal={isLocal} t={t} />
          <p className={`${t.versionText} text-xs`}>{version ? `v${version.current}` : '...'}</p>
          {hasUpdate && !updating && (
            <button
              onClick={triggerUpdate}
              className="mt-2 w-full text-xs px-3 py-1.5 rounded-md bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
            >
              Update to v{version.latest}
            </button>
          )}
          {updating && <p className="text-amber-400 text-xs mt-2 animate-pulse">Updating...</p>}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}
