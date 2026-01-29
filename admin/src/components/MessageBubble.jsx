import { useState } from 'react'

// ── JSON to YAML converter ──

function toYaml(value, indent = 0) {
  const pad = '  '.repeat(indent)

  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)

  if (typeof value === 'string') {
    if (value === '') return "''"
    if (value.includes('\n')) {
      const lines = value.split('\n').map((l) => pad + '  ' + l)
      return '|\n' + lines.join('\n')
    }
    if (/[:{}\[\],&*?|>!%@`#'"]/.test(value) || value === 'true' || value === 'false' || value === 'null' || !isNaN(value)) {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    }
    return value
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return value
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const inner = toYaml(item, indent + 1)
          const lines = inner.split('\n')
          return `${pad}- ${lines[0].trimStart()}\n${lines.slice(1).join('\n')}`.trimEnd()
        }
        return `${pad}- ${toYaml(item, indent + 1)}`
      })
      .join('\n')
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) return '{}'
    return entries
      .map(([k, v]) => {
        if (typeof v === 'object' && v !== null && ((Array.isArray(v) && v.length > 0) || (!Array.isArray(v) && Object.keys(v).length > 0))) {
          return `${pad}${k}:\n${toYaml(v, indent + 1)}`
        }
        return `${pad}${k}: ${toYaml(v, indent + 1)}`
      })
      .join('\n')
  }

  return String(value)
}

// ── Detect intent message from Matrix msgtype ──

const INTENT_MSGTYPE = 'com.nervur.intent'

function isIntentMessage(msg) {
  return msg.msgtype === INTENT_MSGTYPE
}

// ── Intent badge ──

function IntentBadge({ intent }) {
  if (!intent) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        missing_intent
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
      {intent}
    </span>
  )
}

// ── Collapsible YAML payload ──

function PayloadBlock({ payload }) {
  const [expanded, setExpanded] = useState(false)
  if (payload === undefined || payload === null) return null
  const isObj = typeof payload === 'object'
  const keys = isObj ? Object.keys(payload) : null
  if (isObj && keys.length === 0) return null

  const yaml = toYaml(payload)
  const label = isObj ? `${keys.length} field${keys.length !== 1 ? 's' : ''}` : 'payload'

  return (
    <div className="mt-1.5">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setExpanded(!expanded)
        }}
        className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {label}
      </button>
      {expanded && (
        <pre className="mt-1 text-[11px] font-mono leading-relaxed text-gray-700 bg-gray-50 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-words">
          {yaml}
        </pre>
      )}
    </div>
  )
}

// ── Main component ──

/**
 * Renders a single chat message bubble.
 *
 * Props:
 * - msg: { id, sender, body, timestamp, msgtype?, intent?, payload? }
 * - isBrain: boolean
 * - formatTime: (ts) => string
 * - senderName: (sender) => string
 * - variant: 'chat' (WhatsApp-style bubbles) or 'feed' (linear feed)
 * - roomName / roomColorClass: optional, for feed variant
 */
export default function MessageBubble({ msg, isBrain, formatTime, senderName, variant = 'chat', roomName, roomColorClass }) {
  const isIntent = isIntentMessage(msg)

  if (variant === 'feed') {
    return (
      <div className="flex items-start gap-2.5 py-1">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
            isBrain ? 'bg-nervur-100 text-nervur-700' : 'bg-gray-200 text-gray-600'
          }`}
        >
          {senderName(msg.sender).charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${isBrain ? 'text-nervur-700' : 'text-gray-700'}`}>
              {senderName(msg.sender)}
            </span>
            {roomName && (
              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full ${roomColorClass || ''}`}>
                {roomName}
              </span>
            )}
            {isIntent && <IntentBadge intent={msg.intent} />}
            <span className="text-[10px] text-gray-400">{formatTime(msg.timestamp)}</span>
          </div>
          {isIntent ? (
            <PayloadBlock payload={msg.payload} />
          ) : (
            <p className="text-sm text-gray-900 whitespace-pre-wrap break-words mt-0.5">{msg.body}</p>
          )}
        </div>
      </div>
    )
  }

  // variant === 'chat' — WhatsApp-style bubbles
  return (
    <div className={`flex ${isBrain ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
          isBrain
            ? 'bg-nervur-600 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-900 rounded-bl-md'
        }`}
      >
        {!isBrain && (
          <p className="text-xs font-medium text-gray-500 mb-0.5">{senderName(msg.sender)}</p>
        )}
        {isIntent ? (
          <>
            <div className="mb-1">
              <IntentBadge intent={msg.intent} />
            </div>
            <PayloadBlock payload={msg.payload} />
          </>
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
        )}
        <p
          className={`text-[10px] mt-1 ${
            isBrain ? 'text-white/60' : 'text-gray-400'
          } text-right`}
        >
          {formatTime(msg.timestamp)}
        </p>
      </div>
    </div>
  )
}
