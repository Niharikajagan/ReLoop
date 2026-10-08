import React, { useCallback, useEffect, useState } from 'react'
import { api, assetUrl } from './api'
import { COLORS, LABELS, fmtDue } from './utils'

function Badge({ state }) {
  return (
    <span className="badge" style={{ '--c': COLORS[state] || COLORS.needs_inspection }}>
      {LABELS[state] || 'Needs a look'}
    </span>
  )
}

function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  )
}

/* ---------------- Item detail ---------------- */
export function ItemPanel({ item, role, sessionId, onClose, onOpenChat }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const canMessage = role === 'student' || role === 'repairer'

  const message = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api.claim(item.id, { party_type: role, session_id: sessionId })
      onOpenChat(r.conversation_id)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const row = (k, v) => (v && v !== 'UNKNOWN' ? <p><b>{k}</b> {v}</p> : <p className="muted"><b>{k}</b> Not stated</p>)

  return (
    <aside className="panel">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <h2>{item.title || 'Item'}</h2>
      {item.image_url && <img className="item-photo" src={assetUrl(item.image_url)} alt={item.title || 'Item photo'} />}
      <Badge state={item.safety_state} />
      {row('Condition', item.condition)}
      {row('Known issues', item.known_issues)}
      {row('Missing parts', item.missing_parts)}
      {row('Size', item.dimensions)}
      <p><b>Pick up by</b> {fmtDue(item.deadline_ts)}</p>
      <p><b>Where</b> {item.display_location}</p>
      <p className="note">Described by the seller, not checked. Inspect it before you use it.</p>
      {canMessage && (
        <button className="btn" onClick={message} disabled={busy}>
          {role === 'repairer' ? 'Offer to repair' : 'Ask for this item'}
        </button>
      )}
      {err && <p className="error">{err}</p>}
    </aside>
  )
}

/* ---------------- Seller ---------------- */
export function SellerPanel({ sellerId, setSellerId, onClose, onOpenChat, onChanged }) {
  const [seller, setSeller] = useState(null)
  const [mode, setMode] = useState('login')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const login = useCallback(async (id) => {
    setErr(''); setMsg('')
    try {
      const s = await api.seller(id)
      if (s.verification_status !== 'verified') {
        setSeller(null); setSellerId(null)
        setErr('An admin still has to verify this ID. Try again after they do.')
        return
      }
      setSeller(s); setSellerId(s.id)
    } catch (e) { setErr(e.message) }
  }, [setSellerId])

  useEffect(() => { if (sellerId && !seller) login(sellerId) }, [sellerId, seller, login])

  const [reg, setReg] = useState({ name: '', phone: '', block: '', floor: '', unit_id: '' })
  const [loginId, setLoginId] = useState('')
  const setR = (k) => (e) => setReg({ ...reg, [k]: e.target.value })

  const register = async (e) => {
    e.preventDefault(); setErr('')
    try {
      const r = await api.register(reg)
      setLoginId(String(r.seller_id)); setMode('login')
      setMsg(`Registered. Your seller ID is ${r.seller_id}. Share it with the admin to get verified.`)
    } catch (x) { setErr(x.message) }
  }

  if (!seller) {
    return (
      <aside className="panel">
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <h2>Seller</h2>
        <div className="tabs">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Log in</button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Register</button>
        </div>
        {mode === 'login' ? (
          <form onSubmit={(e) => { e.preventDefault(); login(Number(loginId)) }}>
            <Field label="Seller ID" type="number" min="1" value={loginId} onChange={(e) => setLoginId(e.target.value)} required />
            <button className="btn" type="submit">Log in</button>
            <p className="muted small">Demo seller ID: 1</p>
          </form>
        ) : (
          <form onSubmit={register}>
            <Field label="Name" value={reg.name} onChange={setR('name')} required />
            <Field label="Phone" value={reg.phone} onChange={setR('phone')} required />
            <div className="two">
              <Field label="Block" value={reg.block} onChange={setR('block')} required />
              <Field label="Floor" value={reg.floor} onChange={setR('floor')} required />
            </div>
            <Field label="Unit" value={reg.unit_id} onChange={setR('unit_id')} required />
            <button className="btn" type="submit">Register</button>
          </form>
        )}
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="error">{err}</p>}
      </aside>
    )
  }

  return <SellerHome seller={seller} onClose={onClose} onOpenChat={onOpenChat} onChanged={onChanged}
    onLogout={() => { setSeller(null); setSellerId(null) }} />
}

function SellerHome({ seller, onClose, onOpenChat, onChanged, onLogout }) {
  const [tab, setTab] = useState('post')
  const [raw, setRaw] = useState('')
  const [deadline, setDeadline] = useState('')
  const [pv, setPv] = useState(null)
  const [photo, setPhoto] = useState(null) // { preview, url }
  const [uploading, setUploading] = useState(false)
  const [photoErr, setPhotoErr] = useState('')
  const [answers, setAnswers] = useState({})
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [mine, setMine] = useState([])
  const [chats, setChats] = useState([])

  const loadLists = useCallback(() => {
    api.sellerItems(seller.id).then(setMine).catch(() => {})
    api.sellerChats(seller.id).then(setChats).catch(() => {})
  }, [seller.id])
  useEffect(() => { loadLists() }, [loadLists, tab])

  const pickPhoto = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return setPhotoErr(`That file is ${f.type || 'an unknown type'}. Use a JPG, PNG or WebP photo.`)
    if (f.size > 5 * 1024 * 1024) return setPhotoErr('That photo is over 5 MB. Pick a smaller one.')
    setPhotoErr(''); setUploading(true)
    try {
      const r = await api.upload(f, seller.id)
      setPhoto({ preview: URL.createObjectURL(f), url: r.image_url })
    } catch (x) { setPhotoErr('Upload failed: ' + x.message) } finally { setUploading(false) }
  }

  const preview = async () => {
    setErr(''); setMsg('')
    try { setPv(await api.preview(raw)); setAnswers({}) } catch (e) { setErr(e.message) }
  }
  const publish = async () => {
    setErr('')
    try {
      await api.createItem({ seller_id: seller.id, raw_text: raw, deadline_text: deadline, answers, image_url: photo?.url })
      setRaw(''); setDeadline(''); setPv(null); setPhoto(null)
      setMsg('Published. Your item is now floating in the loop.')
      onChanged()
    } catch (e) { setErr(e.message) }
  }

  return (
    <aside className="panel">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <h2>Hi, {seller.name}</h2>
      <p className="muted small">Block {seller.block}, Floor {seller.floor}. <button className="link" onClick={onLogout}>Log out</button></p>
      <div className="tabs">
        {[['post', 'Post item'], ['items', 'My items'], ['chats', 'Chats']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'post' && (
        <>
          <label className="field">
            <span>Describe the item in any language</span>
            <textarea rows={4} value={raw} onChange={(e) => setRaw(e.target.value)}
              placeholder="Washing machine chal raha hai but drain leak. Sunday tak nikalna hai." />
          </label>
          <Field label="Pick up by (for example Sunday or tomorrow)" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <div className="field">
            <span>Photo (optional)</span>
            {photo ? (
              <div className="photo-pick">
                <img src={photo.preview} alt="Selected item" />
                <button className="link" onClick={() => setPhoto(null)}>Remove</button>
              </div>
            ) : (
              <label className="btn ghost file">
                {uploading ? 'Uploading…' : 'Choose a photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} disabled={uploading} hidden />
              </label>
            )}
            {photoErr && <p className="error">{photoErr}</p>}
          </div>
          <button className="btn ghost" onClick={preview} disabled={!raw.trim()}>Check with AI</button>
          {pv && (
            <div className="preview">
              <p><b>{pv.extracted.title}</b> <Badge state={pv.safety_state} /></p>
              <p className="muted small">{pv.reason}</p>
              {pv.questions.map((q) => (
                <Field key={q.field} label={q.question} value={answers[q.field] || ''}
                  onChange={(e) => setAnswers({ ...answers, [q.field]: e.target.value })} />
              ))}
              <button className="btn" onClick={publish}>Publish item</button>
            </div>
          )}
        </>
      )}

      {tab === 'items' && (mine.length === 0 ? <p className="muted">You have not posted anything yet.</p> : mine.map((it) => (
        <div className="card" key={it.id}>
          <div><b>{it.title}</b><p className="muted small">{it.status.replace(/_/g, ' ')}</p></div>
          {it.status !== 'picked_up' && (
            <button className="btn ghost sm" onClick={async () => { await api.markPickedUp(it.id); loadLists(); onChanged() }}>Picked up</button>
          )}
        </div>
      )))}

      {tab === 'chats' && (chats.length === 0 ? <p className="muted">No one has messaged you yet.</p> : chats.map((c) => (
        <button className="card click" key={c.id} onClick={() => onOpenChat(c.id)}>
          <div><b>{c.item_title}</b><p className="muted small">{c.other_party_name}</p></div>
        </button>
      )))}

      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}
    </aside>
  )
}

/* ---------------- Admin ---------------- */
export function AdminPanel({ onClose }) {
  const [pin, setPin] = useState(() => sessionStorage.getItem('reloop_pin') || '')
  const [authed, setAuthed] = useState(false)
  const [list, setList] = useState([])
  const [err, setErr] = useState('')

  const load = useCallback((p) => api.pending(p).then(setList), [])
  const enter = async (p) => {
    setErr('')
    try { await api.adminLogin(p); sessionStorage.setItem('reloop_pin', p); setAuthed(true); await load(p) }
    catch (e) { setErr(e.message); setAuthed(false) }
  }
  useEffect(() => { if (pin) enter(pin) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="panel">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <h2>Admin</h2>
      {!authed ? (
        <form onSubmit={(e) => { e.preventDefault(); enter(pin) }}>
          <Field label="Admin PIN" type="password" value={pin} onChange={(e) => setPin(e.target.value)} required />
          <button className="btn" type="submit">Enter</button>
          <p className="muted small">Default PIN is reloop-admin. Change it in backend/.env.</p>
        </form>
      ) : (
        <>
          <p className="muted">Sellers waiting for verification</p>
          {list.length === 0 && <p>Nobody is waiting.</p>}
          {list.map((s) => (
            <div className="card" key={s.id}>
              <div><b>#{s.id} {s.name}</b><p className="muted small">Block {s.block}, Floor {s.floor}, Unit {s.unit_id}</p></div>
              <button className="btn sm" onClick={async () => { await api.verify(s.id, pin); load(pin) }}>Verify</button>
            </div>
          ))}
        </>
      )}
      {err && <p className="error">{err}</p>}
    </aside>
  )
}
