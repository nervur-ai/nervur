import { useState, useEffect, useRef, useCallback } from 'react'
import MessageBubble from '../components/MessageBubble.jsx'

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

// Simple hash to pick a consistent color per room
const roomColors = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700'
]

function roomColor(roomId) {
  let hash = 0
  for (let i = 0; i < roomId.length; i++) hash = (hash * 31 + roomId.charCodeAt(i)) | 0
  return roomColors[Math.abs(hash) % roomColors.length]
}

function formatTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function senderName(sender) {
  const local = sender.replace(/^@/, '').split(':')[0]
  return local.charAt(0).toUpperCase() + local.slice(1)
}

const CHUNK_SIZE = 300

export default function Messages() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)
  const [live, setLive] = useState(false)
  const messagesEndRef = useRef(null)
  const esRef = useRef(null)
  const autoScroll = useRef(true)
  const containerRef = useRef(null)

  // Fetch the latest chunk (initial load / refresh)
  const fetchMessages = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/brain/messages?limit=${CHUNK_SIZE}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMessages(data.messages || [])
      setHasMore(!!data.hasMore)
      autoScroll.current = true
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load older messages before the oldest current message
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    const oldestTs = messages[0].timestamp
    const el = containerRef.current
    const prevScrollHeight = el?.scrollHeight || 0
    try {
      const res = await fetch(`/api/brain/messages?limit=${CHUNK_SIZE}&before=${oldestTs}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const older = data.messages || []
      setHasMore(!!data.hasMore)
      if (older.length > 0) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id))
          const novel = older.filter((m) => !ids.has(m.id))
          return [...novel, ...prev]
        })
        // Preserve scroll position after prepending
        requestAnimationFrame(() => {
          if (el) el.scrollTop += el.scrollHeight - prevScrollHeight
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, messages])

  // SSE connection for real-time message updates
  useEffect(() => {
    fetchMessages()

    const es = new EventSource('/api/brain/events')
    esRef.current = es

    es.addEventListener('connected', () => setLive(true))

    es.addEventListener('messages', (e) => {
      try {
        const data = JSON.parse(e.data)
        const incoming = data.messages || []
        if (incoming.length === 0) return
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id))
          const novel = incoming.filter((m) => !ids.has(m.id))
          if (novel.length === 0) return prev
          return [...prev, ...novel].sort((a, b) => a.timestamp - b.timestamp)
        })
      } catch {
        /* ignore */
      }
    })

    es.onerror = () => {
      setLive(false)
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Track scroll position to decide auto-scroll
  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    autoScroll.current = atBottom
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-500 text-sm mt-1">
            All brain activity across rooms
            {live && (
              <span className="inline-flex items-center gap-1.5 ml-3">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-600 text-xs font-medium">Live</span>
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchMessages}
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
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 shrink-0">{error}</div>}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto rounded-xl bg-white shadow-sm border border-gray-200 px-4 py-3 space-y-2"
        style={{ minHeight: 0 }}
      >
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Spinner className="w-6 h-6" />
            <span className="ml-3 text-gray-500">Loading messages...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-20">
            <svg className="mx-auto w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="mt-3 text-gray-500">No messages yet</p>
            {live && <p className="mt-1 text-xs text-gray-400">Listening for new messages...</p>}
          </div>
        ) : (
          <>
            {/* Load more button at top */}
            {hasMore && (
              <div className="flex justify-center py-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 disabled:opacity-50"
                >
                  {loadingMore ? <Spinner className="w-3 h-3" /> : null}
                  {loadingMore ? 'Loading...' : 'Load older messages'}
                </button>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isBrain={msg.fromBrain}
                formatTime={formatTime}
                senderName={senderName}
                variant="feed"
                roomName={msg.roomName}
                roomColorClass={roomColor(msg.roomId)}
              />
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
