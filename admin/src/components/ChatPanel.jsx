import { useState, useEffect, useRef } from 'react'
import { Spinner } from './UserComponents.jsx'
import MessageBubble from './MessageBubble.jsx'

export default function ChatPanel({ roomId, roomName, brainUserId, onClose, readOnly = false, hideHeader = false }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)
  const pollRef = useRef(null)

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/brain/rooms/${encodeURIComponent(roomId)}/messages`)
      const data = await res.json()
      if (data.messages) setMessages(data.messages)
    } catch {
      /* ignore polling errors */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setMessages([])
    fetchMessages()
    pollRef.current = setInterval(fetchMessages, 3000)
    return () => clearInterval(pollRef.current)
  }, [roomId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    try {
      await fetch(`/api/brain/rooms/${encodeURIComponent(roomId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text })
      })
      await fetchMessages()
    } catch {
      /* ignore */
    }
    setSending(false)
  }

  const formatTime = (ts) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const senderName = (sender) => {
    const local = sender.replace(/^@/, '').split(':')[0]
    return local.charAt(0).toUpperCase() + local.slice(1)
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 truncate">{roomName}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="w-5 h-5" />
            <span className="ml-2 text-gray-400 text-sm">Loading messages...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No messages yet</div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isBrain={msg.sender === brainUserId}
              formatTime={formatTime}
              senderName={senderName}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — hidden in readOnly mode */}
      {!readOnly && (
        <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-3 border-t border-gray-200">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nervur-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="p-2 bg-nervur-600 text-white rounded-lg hover:bg-nervur-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <Spinner className="w-4 h-4 !text-white" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </form>
      )}
    </div>
  )
}
