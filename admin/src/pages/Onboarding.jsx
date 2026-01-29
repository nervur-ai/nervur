import { useState, useEffect } from 'react'
import ServerStep from './ServerStep.jsx'
import BrainStep from './BrainStep.jsx'
import NetworkingStep from './NetworkingStep.jsx'

const STEPS_LOCAL = [
  { id: 'server', title: 'Server' },
  { id: 'brain', title: 'Brain' },
  { id: 'network', title: 'Network' },
  { id: 'ready', title: 'Ready' }
]

const STEPS_REMOTE = [
  { id: 'server', title: 'Server' },
  { id: 'brain', title: 'Brain' },
  { id: 'ready', title: 'Ready' }
]

// Map old step names to new ones for resume
const STEP_MIGRATION = {
  choose: 'server',
  connect: 'server',
  provision: 'server',
  identity: 'brain',
  networking: 'network',
  done: 'ready'
}

export default function Onboarding({ savedConfig, onComplete }) {
  const [path, setPath] = useState(null)
  const [step, setStep] = useState('server')
  const [server, setServer] = useState(null) // { url, serverName, registrationSecret? }
  const [brain, setBrain] = useState(null)

  // Fetch the full config from the server and pass it to onComplete
  // This ensures the frontend gets all fields (type, networkMode, domain, etc.)
  const finishOnboarding = async () => {
    try {
      const res = await fetch('/api/status')
      const data = await res.json()
      if (data.config) {
        onComplete(data.config)
        return
      }
    } catch {}
    // Fallback: pass what we have
    onComplete({ homeserver: { url: server?.url, serverName: server?.serverName }, brain })
  }

  // Restore from saved config
  useEffect(() => {
    const ob = savedConfig?.onboarding
    if (!ob) return

    if (ob.path) setPath(ob.path)

    // Restore server info
    if (ob.homeserver?.url) {
      setServer({
        url: ob.homeserver.url,
        serverName: ob.homeserver.serverName || ob.serverName,
        registrationSecret: ob.registrationSecret
      })
    }

    // Restore brain
    if (ob.brain) setBrain(ob.brain)

    // Resume at the right step (migrate old names)
    if (ob.step) {
      const migrated = STEP_MIGRATION[ob.step] || ob.step
      setStep(migrated)
    }
  }, [savedConfig])

  const visibleSteps = path === 'remote' ? STEPS_REMOTE : path === 'local' ? STEPS_LOCAL : null
  const currentStepIndex = visibleSteps ? visibleSteps.findIndex((s) => s.id === step) : -1

  async function resetOnboarding() {
    await fetch('/api/onboarding/reset', { method: 'POST' })
    setPath(null)
    setStep('server')
    setServer(null)
    setBrain(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-nervur-900 to-nervur-950 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white tracking-tight">NERVUR</h1>
          <p className="text-nervur-400 mt-2">Private AI Workforce Platform</p>
        </div>

        {/* Progress dots */}
        {visibleSteps && <div className="flex justify-center mb-8">
          {visibleSteps.map((s, index) => {
            const isComplete = index < currentStepIndex
            const isCurrent = index === currentStepIndex
            return (
              <div key={s.id} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    isComplete
                      ? 'bg-green-500 text-white'
                      : isCurrent
                        ? 'bg-nervur-500 text-white'
                        : 'bg-nervur-800 text-nervur-500'
                  }`}
                  title={s.title}
                >
                  {isComplete ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                {index < visibleSteps.length - 1 && (
                  <div className={`w-12 h-0.5 ${isComplete ? 'bg-green-500' : 'bg-nervur-800'}`} />
                )}
              </div>
            )
          })}
        </div>}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 relative">
          {step !== 'server' && step !== 'ready' && (
            <button
              onClick={resetOnboarding}
              className="absolute top-4 right-4 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Start over
            </button>
          )}

          {/* ── Server ── */}
          {step === 'server' && (
            <ServerStep
              path={path}
              onPathChange={(p) => {
                setPath(p)
                setServer(null)
                setBrain(null)
              }}
              onVerified={(result) => {
                setServer(result)
                setStep('brain')
              }}
              savedConfig={savedConfig}
              onReset={resetOnboarding}
              existingServer={server}
            />
          )}

          {/* ── Brain ── */}
          {step === 'brain' && server && (
            <BrainStep
              server={server}
              path={path}
              onCreated={(brainData) => {
                setBrain(brainData)
                if (path === 'local') {
                  setStep('network')
                } else {
                  setStep('ready')
                  finishOnboarding()
                }
              }}
              onBack={() => setStep('server')}
              savedConfig={savedConfig}
            />
          )}

          {/* ── Network (local only) ── */}
          {step === 'network' && path === 'local' && (
            <NetworkingStep
              serverName={server?.serverName}
              onBack={() => setStep('brain')}
              onComplete={() => {
                setStep('ready')
                finishOnboarding()
              }}
              onSkip={() => {
                fetch('/api/onboarding/local/networking/save', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' }
                })
                setStep('ready')
                finishOnboarding()
              }}
              savedConfig={savedConfig}
            />
          )}

          {/* ── Broken resume: step can't render (missing path, server, etc.) ── */}
          {step !== 'server' && step !== 'ready' &&
           !(step === 'brain' && server) &&
           !(step === 'network' && path === 'local') && (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Setup interrupted</h2>
              <p className="text-gray-500 text-sm mb-6">
                A previous setup was incomplete and can't be resumed. Start fresh to configure your brain.
              </p>
              <button
                onClick={resetOnboarding}
                className="px-5 py-2.5 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 transition-colors text-sm font-medium"
              >
                Start fresh
              </button>
            </div>
          )}

          {/* ── Ready ── */}
          {step === 'ready' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Brain Initialized</h2>
              <p className="text-gray-600 mb-6">Your brain is ready to go.</p>

              <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2">
                {server && (
                  <div>
                    <p className="text-xs text-gray-500">Homeserver</p>
                    <p className="text-sm font-mono text-gray-900">{server.url}</p>
                  </div>
                )}
                {brain?.user_id && (
                  <div>
                    <p className="text-xs text-gray-500">Brain ID</p>
                    <p className="text-sm font-mono text-gray-900 break-all">{brain.user_id}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
