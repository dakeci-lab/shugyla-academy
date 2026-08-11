import { getApplyUrl } from '../../../utils/recruitmentData'

export const STATUS_BADGE = {
  draft: 'warning',
  published: 'done',
  archived: 'idle',
}

export const EMPTY_VACANCY = {
  title: '',
  description: '',
  city: '',
  storeName: '',
  storeAddress: '',
  salaryFrom: '',
  salaryTo: '',
  salaryNote: '',
  schedule: '',
  employmentType: '',
  experienceRequirement: '',
  positionId: '',
  role: '',
  employeeRole: '',
  status: 'draft',
}

export const EMPLOYMENT_TYPE_OPTIONS = [
  'full_time',
  'part_time',
  'temporary',
  'internship',
  'contract',
]

export const EXPERIENCE_REQUIREMENT_OPTIONS = [
  'not_required',
  'preferred',
  'required',
]

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
