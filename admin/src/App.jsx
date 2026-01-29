import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Onboarding from './pages/Onboarding.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Users from './pages/Users.jsx'
import Rooms from './pages/Rooms.jsx'
import HSSettings from './pages/HSSettings.jsx'
import Settings from './pages/Settings.jsx'
import Invitations from './pages/Invitations.jsx'
import Layout from './components/Layout.jsx'
import './App.css'

export default function App() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ initialized: false }))
  }, [])

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-nervur-600 text-xl">Loading...</div>
      </div>
    )
  }

  if (!status.initialized) {
    return <Onboarding savedConfig={status.config} onComplete={(config) => setStatus({ initialized: true, config })} />
  }

  const config = status.config
  const isLocal = config?.homeserver?.type === 'local'

  return (
    <BrowserRouter>
      <Layout config={config}>
        <Routes>
          <Route path="/" element={<Dashboard config={config} />} />
          <Route path="/invitations" element={<Invitations />} />
          {isLocal ? (
            <>
              <Route path="/homeserver" element={<Navigate to="/homeserver/users" replace />} />
              <Route path="/homeserver/users" element={<Users config={config} />} />
              <Route path="/homeserver/rooms" element={<Rooms config={config} />} />
              <Route path="/homeserver/settings" element={<HSSettings config={config} />} />
            </>
          ) : (
            <Route path="/homeserver/*" element={<Navigate to="/" replace />} />
          )}
          <Route path="/settings" element={<Settings config={config} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
