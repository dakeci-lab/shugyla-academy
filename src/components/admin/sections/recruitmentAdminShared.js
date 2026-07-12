import { getApplyUrl } from '../../../utils/recruitmentData'

export const STATUS_BADGE = {
  draft: 'warning',
  published: 'done',
  archived: 'idle',
}

export const EMPTY_VACANCY = {
  title: '',
  description: '',
  role: 'cashier',
  employeeRole: 'cashier',
  passingScore: 80,
  status: 'draft',
}

export function formatRecruitmentDate(value) {
  if (!value) return '—'

  const raw = String(value).trim()
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    return `${day}.${month}.${year}`
  }

  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'

  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  return `${dd}.${mm}.${yy}`
}

export function copyApplyLink(slug) {
  const url = getApplyUrl(slug)
  navigator.clipboard?.writeText(url).catch(() => {})
  return url
}
