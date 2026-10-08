import React, { useEffect, useRef, useState } from 'react'
import { api, WS_URL } from './api'

export default function ChatPanel({ cid, role, sessionId, onClose }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [live, setLive] = useState(false)
  const ws = useRef(null)
  const end = useRef(null)

  useEffect(() => {
    let closed = false
    api.messages(cid).then((m) => !closed && setMessages(m)).catch(() => {})
    const sock = new WebSocket(`${WS_URL}/ws/chat/${cid}`)
    sock.onopen = () => setLive(true)
    sock.onclose = () => setLive(false)
    sock.onmessage = (e) => setMessages((prev) => [...prev, JSON.parse(e.data)])
    ws.current = sock
    return () => { closed = true; sock.close() }
  }, [cid])

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t || ws.current?.readyState !== WebSocket.OPEN) return
    ws.current.send(JSON.stringify({ sender_type: role, text: t, session_id: sessionId }))
    setText('')
  }

  return (
    <aside className="panel chat">
      <button className="close" onClick={onClose} aria-label="Close chat">×</button>
      <h2>Anonymous chat</h2>
      <p className="muted small">{live ? 'Connected. Phone numbers stay private.' : 'Connecting…'}</p>
      <div className="chat-body">
        {messages.length === 0 && <p className="muted">No messages yet. Say what you can offer or when you can pick up.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.sender_type === role ? 'mine' : 'theirs'} ${m.sender_type}`}>
            {m.text}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="chat-input" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" maxLength={1000} />
        <button className="btn" type="submit" disabled={!live}>Send</button>
      </form>
    </aside>
  )
}
