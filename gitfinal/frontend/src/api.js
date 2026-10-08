const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const assetUrl = (p) => (p ? API + p : '')
export const WS_URL = API.replace(/^http/, 'ws')

async function req(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let msg = 'Something went wrong. Is the backend running?'
    try { msg = (await res.json()).detail || msg } catch { /* keep default */ }
    throw new Error(msg)
  }
  return res.json()
}

export const api = {
  items: (status = 'published,interested,warning_1_sent,warning_2_sent') =>
    req(`/items?status=${status}`),
  claim: (id, body) => req(`/items/${id}/claim`, { method: 'POST', body }),
  markPickedUp: (id) => req(`/items/${id}/picked-up`, { method: 'POST' }),
  messages: (cid) => req(`/conversations/${cid}/messages`),

  register: (body) => req('/sellers/register', { method: 'POST', body }),
  seller: (id) => req(`/sellers/${id}`),
  sellerItems: (id) => req(`/sellers/${id}/items`),
  sellerChats: (id) => req(`/sellers/${id}/conversations`),
  preview: (raw_text) => req('/sellers/preview', { method: 'POST', body: { raw_text } }),
  upload: async (file, sellerId) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('seller_id', sellerId)
    const res = await fetch(API + '/uploads', { method: 'POST', body: fd })
    if (!res.ok) {
      let msg = 'Upload failed. Is the backend running?'
      try { msg = (await res.json()).detail || msg } catch { /* keep default */ }
      throw new Error(msg)
    }
    return res.json()
  },
  createItem: (body) => req('/items', { method: 'POST', body }),

  adminLogin: (pin) => req('/admin/login', { method: 'POST', body: { pin } }),
  pending: (pin) => req('/admin/pending-sellers', { headers: { 'X-Admin-Pin': pin } }),
  verify: (id, pin) => req(`/admin/verify/${id}`, { method: 'POST', headers: { 'X-Admin-Pin': pin } }),
}
