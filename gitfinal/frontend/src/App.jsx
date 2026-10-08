import React, { useMemo, useState } from 'react'
import Scene3D from './Scene3D.jsx'
import ChatPanel from './ChatPanel.jsx'
import { ItemPanel, SellerPanel, AdminPanel } from './Panels.jsx'
import { ROLES } from './utils'

export default function App() {
  const [role, setRole] = useState(null)
  const [panel, setPanel] = useState(null) // { type: 'item' | 'chat' | 'seller' | 'admin', ... }
  const [refreshKey, setRefreshKey] = useState(0)
  const [sellerId, setSellerIdState] = useState(() => Number(localStorage.getItem('reloop_seller')) || null)

  const sessionId = useMemo(() => {
    let id = sessionStorage.getItem('reloop_session')
    if (!id) { id = 'guest-' + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('reloop_session', id) }
    return id
  }, [])

  const setSellerId = (id) => {
    setSellerIdState(id)
    id ? localStorage.setItem('reloop_seller', String(id)) : localStorage.removeItem('reloop_seller')
  }

  const pickRole = (r) => {
    setRole(r)
    setPanel(r === 'seller' ? { type: 'seller' } : r === 'admin' ? { type: 'admin' } : null)
  }
  const close = () => setPanel(null)
  const current = ROLES.find((r) => r.key === role)

  return (
    <div className="app">
      <Scene3D role={role} refreshKey={refreshKey} onPickRole={pickRole}
        onSelectItem={(item) => setPanel({ type: 'item', item })} />

      <header className="hud">
        <div className="brand">ReLoop<span>Community reuse and repair</span></div>
        {role && (
          <div className="hud-actions">
            <span className="chip" style={{ '--c': current.color }}>{current.label}</span>
            {(role === 'seller' || role === 'admin') && (
              <button className="btn ghost sm" onClick={() => setPanel({ type: role })}>Dashboard</button>
            )}
            <button className="btn ghost sm" onClick={() => { setRole(null); setPanel(null) }}>Switch role</button>
          </div>
        )}
      </header>

      {!role && <p className="hint">Drag to look around. Click a platform to enter.</p>}

      {panel?.type === 'item' && (
        <ItemPanel item={panel.item} role={role} sessionId={sessionId} onClose={close}
          onOpenChat={(cid) => setPanel({ type: 'chat', cid })} />
      )}
      {panel?.type === 'chat' && <ChatPanel cid={panel.cid} role={role} sessionId={sessionId} onClose={close} />}
      {panel?.type === 'seller' && (
        <SellerPanel sellerId={sellerId} setSellerId={setSellerId} onClose={close}
          onOpenChat={(cid) => setPanel({ type: 'chat', cid })}
          onChanged={() => setRefreshKey((k) => k + 1)} />
      )}
      {panel?.type === 'admin' && <AdminPanel onClose={close} />}
    </div>
  )
}
