import './admin-shared.css'

const STATUS_STYLES = {
  idle: 'admin-badge--idle',
  progress: 'admin-badge--progress',
  done: 'admin-badge--done',
  passed: 'admin-badge--passed',
  failed: 'admin-badge--failed',
  published: 'admin-badge--published',
  draft: 'admin-badge--draft',
  active: 'admin-badge--active',
}

/** Цветной бейдж статуса */
export default function StatusBadge({ label, type = 'idle' }) {
  return (
    <span className={`admin-badge ${STATUS_STYLES[type] || ''}`}>
      {label}
    </span>
  )
}
