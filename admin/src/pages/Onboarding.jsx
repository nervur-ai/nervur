import { useReducer, useEffect } from 'react'
import ServerStep from './ServerStep.jsx'
import BrainStep from './BrainStep.jsx'
import NetworkingStep from './NetworkingStep.jsx'
import {
  onboardingReducer,
  createInitialState,
  getStepTitles,
  ACTIONS
} from '../onboarding/machine.js'

export default function Onboarding({ savedConfig, onComplete }) {
  const [ctx, dispatch] = useReducer(onboardingReducer, undefined, createInitialState)

  // Fetch the full config from the server and pass it to onComplete
  const finishOnboarding = async () => {
    // Call /complete to finalize config (move networking data, delete onboarding key)
    try {
      const completeRes = await fetch('/api/onboarding/complete', { method: 'POST' })
      const completeData = await completeRes.json()
      if (completeData.config) {
        onComplete(completeData.config)
        return
      }
    } catch {}
    // Fallback: fetch status
    try {
      const res = await fetch('/api/status')
      const data = await res.json()
      if (data.config) {
        onComplete(data.config)
        return
      }
    } catch {}
    // Last resort
    onComplete({ homeserver: { url: ctx.server?.url, serverName: ctx.server?.serverName }, brain: ctx.brain })
  }

  // Restore from saved config on mount
  useEffect(() => {
    const ob = savedConfig?.onboarding
    if (!ob) return
    dispatch({ type: ACTIONS.RESTORE, onboarding: ob })
  }, [savedConfig])

  // Auto-finish when reaching ready step
  useEffect(() => {
    if (ctx.step === 'ready' && ctx.brain?.user_id) {
      finishOnboarding()
    }
  }, [ctx.step, ctx.brain?.user_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const stepTitles = getStepTitles(ctx.path)
  const currentStepIndex = stepTitles ? stepTitles.findIndex((s) => s.id === ctx.step) : -1

  async function resetOnboarding() {
    await fetch('/api/onboarding/reset', { method: 'POST' })
    dispatch({ type: ACTIONS.RESET })
  }

  async function factoryReset() {
    await fetch('/api/onboarding/factory-reset', { method: 'POST' })
    dispatch({ type: ACTIONS.RESET })
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
        {stepTitles && <div className="flex justify-center mb-8">
          {stepTitles.map((s, index) => {
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
                {index < stepTitles.length - 1 && (
                  <div className={`w-12 h-0.5 ${isComplete ? 'bg-green-500' : 'bg-nervur-800'}`} />
                )}
              </div>
            )
          })}
        </div>}

        {/* Resume message */}
        {ctx.resumeMessage && (
          <div className="mb-4 text-center">
            <p className="text-nervur-400 text-sm">{ctx.resumeMessage}</p>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 relative">
          {ctx.step !== 'server' && ctx.step !== 'ready' && (
            <button
              onClick={resetOnboarding}
              className="absolute top-4 right-4 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Start over
            </button>
          )}

          {/* Server */}
          {ctx.step === 'server' && (
            <ServerStep
              ctx={ctx}
              dispatch={dispatch}
              savedConfig={savedConfig}
              onReset={resetOnboarding}
              onFactoryReset={factoryReset}
            />
          )}

          {/* Brain */}
          {ctx.step === 'brain' && ctx.server && (
            <BrainStep
              ctx={ctx}
              dispatch={dispatch}
              savedConfig={savedConfig}
            />
          )}

          {/* Network (local only) */}
          {ctx.step === 'network' && ctx.path === 'local' && (
            <NetworkingStep
              ctx={ctx}
              dispatch={dispatch}
              savedConfig={savedConfig}
            />
          )}

          {/* Ready */}
          {ctx.step === 'ready' && (
            <ReadyStep server={ctx.server} brain={ctx.brain} />
          )}
        </div>
      </div>
    </div>
  )
}

function ReadyStep({ server, brain }) {
  return (
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
  )
}
