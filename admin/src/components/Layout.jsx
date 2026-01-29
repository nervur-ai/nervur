import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

function HomeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function InboxIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function ServerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  )
}

function CogIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

const hsSubLinks = [
  { name: 'Settings', href: '/homeserver/settings' },
  { name: 'Users', href: '/homeserver/users' },
  { name: 'Rooms', href: '/homeserver/rooms' },
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

export default function Layout({ children, config }) {
  const location = useLocation()
  const isLocal = config?.homeserver?.type === 'local'
  const brainName = config?.brain?.name
  const hsActive = location.pathname.startsWith('/homeserver')

  const [version, setVersion] = useState(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetch('/api/version').then(r => r.json()).then(setVersion).catch(() => {})
  }, [])

  const hasUpdate = version?.latest && compareVersions(version.current, version.latest) < 0

  const triggerUpdate = async () => {
    if (updating) return
    setUpdating(true)
    try {
      await fetch('/api/update', { method: 'POST' })
    } catch {}
    // Container will restart — poll until it's back
    const poll = setInterval(async () => {
      try {
        const r = await fetch('/api/version')
        if (r.ok) {
          clearInterval(poll)
          window.location.reload()
        }
      } catch {}
    }, 3000)
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-nervur-900 text-white flex flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight">NERVUR</h1>
          <p className="text-nervur-400 text-sm mt-0.5">AI Workforce Platform</p>
          {brainName && (
            <div className="mt-3 px-3 py-1.5 bg-nervur-800 rounded-md">
              <p className="text-white text-sm font-semibold truncate">{brainName}</p>
            </div>
          )}
        </div>
        <nav className="flex-1 px-4">
          {/* Dashboard */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                isActive
                  ? 'bg-nervur-700 text-white'
                  : 'text-nervur-300 hover:bg-nervur-800 hover:text-white'
              }`
            }
          >
            <HomeIcon />
            Dashboard
          </NavLink>

          {/* Invitations */}
          <NavLink
            to="/invitations"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                isActive
                  ? 'bg-nervur-700 text-white'
                  : 'text-nervur-300 hover:bg-nervur-800 hover:text-white'
              }`
            }
          >
            <InboxIcon />
            Invitations
          </NavLink>

          {/* Homeserver — expandable sub-nav for local only, hidden for remote */}
          {isLocal && (
            <div className="mb-1">
              <NavLink
                to="/homeserver/settings"
                className={() =>
                  `flex items-center justify-between gap-3 px-4 py-3 rounded-lg transition-colors ${
                    hsActive
                      ? 'bg-nervur-700 text-white'
                      : 'text-nervur-300 hover:bg-nervur-800 hover:text-white'
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
                  {hsSubLinks.map(item => (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      end
                      className={({ isActive }) =>
                        `block px-3 py-1.5 rounded-md text-sm transition-colors ${
                          isActive
                            ? 'text-white bg-nervur-600'
                            : 'text-nervur-400 hover:text-white hover:bg-nervur-800'
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
              `flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                isActive
                  ? 'bg-nervur-700 text-white'
                  : 'text-nervur-300 hover:bg-nervur-800 hover:text-white'
              }`
            }
          >
            <CogIcon />
            Settings
          </NavLink>
        </nav>
        <div className="p-4 border-t border-nervur-800">
          <p className="text-nervur-500 text-xs">
            {version ? `v${version.current}` : '...'}
          </p>
          {hasUpdate && !updating && (
            <button
              onClick={triggerUpdate}
              className="mt-2 w-full text-xs px-3 py-1.5 rounded-md bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
            >
              Update to v{version.latest}
            </button>
          )}
          {updating && (
            <p className="text-amber-400 text-xs mt-2 animate-pulse">Updating...</p>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
