// Onboarding state machine
// Steps: server, brain, network, ready, welcome
// Paths: local, remote, companion, null

const STEPS_LOCAL = ['server', 'brain', 'network', 'ready']
const STEPS_REMOTE = ['server', 'brain', 'ready']
const STEPS_COMPANION = ['welcome', 'brain', 'ready']

// Map old step names to new ones for resume
const STEP_MIGRATION = {
  choose: 'server',
  connect: 'server',
  provision: 'server',
  identity: 'brain',
  networking: 'network',
  done: 'ready'
}

export function migrateStep(step) {
  return STEP_MIGRATION[step] || step
}

export function getVisibleSteps(path) {
  if (path === 'local') return STEPS_LOCAL
  if (path === 'remote') return STEPS_REMOTE
  if (path === 'companion') return STEPS_COMPANION
  return null
}

export function getStepTitles(path) {
  const titles = { server: 'Server', brain: 'Brain', network: 'Network', ready: 'Ready', welcome: 'Server' }
  const steps = getVisibleSteps(path)
  if (!steps) return null
  return steps.map(id => ({ id, title: titles[id] }))
}

// Guards: can this step be entered given current context?
export function canEnter(step, ctx) {
  switch (step) {
    case 'server':
      return true
    case 'welcome':
      return ctx.path === 'companion'
    case 'brain':
      return !!(ctx.server?.url && ctx.server?.serverName)
    case 'network':
      return ctx.path === 'local' && !!ctx.brain?.user_id
    case 'ready':
      return !!ctx.brain?.user_id
    default:
      return false
  }
}

// Navigation
export function nextStep(step, ctx) {
  switch (step) {
    case 'welcome':
    case 'server':
      return 'brain'
    case 'brain':
      return ctx.path === 'local' ? 'network' : 'ready'
    case 'network':
      return 'ready'
    default:
      return null
  }
}

export function prevStep(step, ctx) {
  switch (step) {
    case 'brain':
      return ctx.path === 'companion' ? 'welcome' : 'server'
    case 'network':
      return 'brain'
    case 'ready':
      return ctx.path === 'local' ? 'network' : 'brain'
    default:
      return null
  }
}

// Resume: find the best step to resume at given saved config
export function resolveResumeStep(savedStep, ctx) {
  const migrated = migrateStep(savedStep)
  const steps = getVisibleSteps(ctx.path)
  if (!steps || !steps.includes(migrated)) return { step: steps?.[0] || 'server', reason: null }

  // Walk backward from saved step until we find one whose guard passes
  const idx = steps.indexOf(migrated)
  for (let i = idx; i >= 0; i--) {
    if (canEnter(steps[i], ctx)) {
      return {
        step: steps[i],
        reason: i < idx ? `Resumed at ${steps[i]} because ${migrated} prerequisites are not met` : null
      }
    }
  }
  return { step: steps[0], reason: `Resumed at ${steps[0]} because no later step is available` }
}

// Reducer action types
export const ACTIONS = {
  RESTORE: 'RESTORE',
  PATH_CHANGED: 'PATH_CHANGED',
  SERVER_VERIFIED: 'SERVER_VERIFIED',
  BRAIN_CREATED: 'BRAIN_CREATED',
  NETWORK_CONFIGURED: 'NETWORK_CONFIGURED',
  NETWORK_SKIPPED: 'NETWORK_SKIPPED',
  GO_BACK: 'GO_BACK',
  RESET: 'RESET',
  SET_STEP: 'SET_STEP'
}

export function createInitialState(companion) {
  if (companion) {
    return {
      path: 'companion',
      step: 'welcome',
      server: { url: companion.url, serverName: companion.serverName },
      identity: null,
      brain: null,
      networking: null,
      resumeMessage: null
    }
  }
  return {
    path: null,
    step: 'server',
    server: null,
    identity: null,
    brain: null,
    networking: null,
    resumeMessage: null
  }
}

export function onboardingReducer(state, action) {
  switch (action.type) {
    case ACTIONS.RESTORE: {
      const { onboarding, companion } = action
      if (!onboarding) return state

      const path = onboarding.path || state.path
      const server = onboarding.server || state.server
      const identity = onboarding.identity || state.identity
      const brain = onboarding.brain || state.brain
      const networking = onboarding.networking || state.networking

      const ctx = { path, server, identity, brain, networking }
      const savedStep = onboarding.step || state.step
      const { step, reason } = resolveResumeStep(savedStep, ctx)

      return { ...ctx, step, resumeMessage: reason }
    }

    case ACTIONS.PATH_CHANGED: {
      // Switching path clears downstream data
      const path = action.path
      return {
        ...state,
        path,
        server: null,
        identity: null,
        brain: null,
        networking: null,
        step: 'server',
        resumeMessage: null
      }
    }

    case ACTIONS.SERVER_VERIFIED: {
      return {
        ...state,
        server: action.server,
        step: 'brain',
        resumeMessage: null
      }
    }

    case ACTIONS.BRAIN_CREATED: {
      const next = nextStep('brain', state)
      return {
        ...state,
        brain: action.brain,
        step: next || 'ready',
        resumeMessage: null
      }
    }

    case ACTIONS.NETWORK_CONFIGURED: {
      return {
        ...state,
        networking: action.networking,
        step: 'ready',
        resumeMessage: null
      }
    }

    case ACTIONS.NETWORK_SKIPPED: {
      return {
        ...state,
        networking: { networkMode: 'local' },
        step: 'ready',
        resumeMessage: null
      }
    }

    case ACTIONS.GO_BACK: {
      const prev = prevStep(state.step, state)
      if (!prev) return state
      return { ...state, step: prev, resumeMessage: null }
    }

    case ACTIONS.RESET: {
      if (action.companion) {
        return createInitialState(action.companion)
      }
      return createInitialState(null)
    }

    case ACTIONS.SET_STEP: {
      return { ...state, step: action.step, resumeMessage: null }
    }

    default:
      return state
  }
}
