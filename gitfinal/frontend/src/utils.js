export const COLORS = {
  reuse_ready: '#5fd0b3',
  needs_inspection: '#f2c14e',
  repair_candidate: '#ef6f6c',
}

export const LABELS = {
  reuse_ready: 'Ready to reuse',
  needs_inspection: 'Needs a look',
  repair_candidate: 'Repair candidate',
}

export const ROLES = [
  { key: 'admin', label: 'Admin', hint: 'Verify sellers', color: '#6ea8fe' },
  { key: 'seller', label: 'Seller', hint: 'Post an item', color: '#c3a6ff' },
  { key: 'student', label: 'Student', hint: 'Find free items', color: '#5fd0b3' },
  { key: 'repairer', label: 'Repairer', hint: 'Fix what can be fixed', color: '#f2a65a' },
]

export function fmtDue(ts) {
  if (!ts) return 'No deadline'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return 'No deadline'
  return d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
