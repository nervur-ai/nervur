import { useState } from 'react'

export const Spinner = ({ className = 'w-4 h-4' }) => (
  <svg className={`animate-spin text-nervur-500 ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
)

export function UserAvatar({ role, isSelf, deactivated }) {
  const colors = deactivated
    ? 'bg-gray-100 text-gray-400'
    : role === 'brain'
      ? isSelf
        ? 'bg-nervur-200 text-nervur-700'
        : 'bg-nervur-100 text-nervur-600'
      : role === 'test'
        ? 'bg-amber-100 text-amber-600'
        : 'bg-green-100 text-green-600'

  const icon =
    role === 'brain' ? (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ) : (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    )

  return <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${colors}`}>{icon}</div>
}

export function RoleBadge({ role, isSelf, deactivated }) {
  if (deactivated)
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Deactivated</span>

  const styles = {
    brain: isSelf ? 'bg-nervur-200 text-nervur-800' : 'bg-nervur-100 text-nervur-700',
    test: 'bg-amber-100 text-amber-700',
    human: 'bg-green-100 text-green-700'
  }
  const labels = {
    brain: isSelf ? 'Brain (self)' : 'Brain',
    test: 'Test',
    human: 'User'
  }

  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[role]}`}>{labels[role]}</span>
}

export function UserCard({ user, onDeactivate, deactivating }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar role={user.role} isSelf={user.isSelf} deactivated={user.deactivated} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{user.displayname || user.name}</h3>
            <RoleBadge role={user.role} isSelf={user.isSelf} deactivated={user.deactivated} />
          </div>
          <p className="font-mono text-xs text-gray-400 mt-0.5 truncate">{user.name}</p>
        </div>
      </div>
      {!user.deactivated && !user.isSelf && (
        <button
          onClick={() => onDeactivate(user)}
          disabled={deactivating === user.name}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-50 shrink-0"
        >
          {deactivating === user.name ? (
            <Spinner />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          )}
          {deactivating === user.name ? 'Deactivating...' : 'Deactivate'}
        </button>
      )}
    </div>
  )
}

export function DeactivateModal({ confirmUser, onCancel, onConfirm }) {
  if (!confirmUser) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Deactivate account</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to deactivate{' '}
              <span className="font-medium text-gray-900">{confirmUser.displayname || confirmUser.name}</span>?
            </p>
            <p className="mt-1 text-sm text-gray-500 font-mono">{confirmUser.name}</p>
            <p className="mt-3 text-sm text-red-600">
              This action cannot be undone. The account will be permanently disabled and the username cannot be reused.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(confirmUser.name)}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
          >
            Deactivate
          </button>
        </div>
      </div>
    </div>
  )
}

export function BrainCard({ brain, testUsers, onDeactivate, deactivating }) {
  const [expanded, setExpanded] = useState(false)
  const hasTestUsers = testUsers.length > 0

  const borderColor = brain.isSelf ? 'border-nervur-500' : 'border-nervur-400'

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${borderColor}`}>
      <div
        className={`p-5 ${hasTestUsers ? 'cursor-pointer' : ''}`}
        onClick={() => hasTestUsers && setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <UserAvatar role="brain" isSelf={brain.isSelf} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 truncate">{brain.displayname || brain.name}</h3>
                <RoleBadge role="brain" isSelf={brain.isSelf} />
                {hasTestUsers && (
                  <span className="text-xs text-gray-400">
                    {testUsers.length} test user{testUsers.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-gray-400 mt-0.5 truncate">{brain.name}</p>
            </div>
          </div>
          {hasTestUsers && (
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </div>

      {expanded && hasTestUsers && (
        <div className="border-t border-gray-100 px-5 pb-4">
          <div className="space-y-3 mt-3">
            {testUsers.map((user) => (
              <div key={user.name} className="pl-6 border-l-2 border-amber-200">
                <UserCard user={user} onDeactivate={onDeactivate} deactivating={deactivating} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
