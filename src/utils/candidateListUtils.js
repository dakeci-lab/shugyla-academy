import {
  CANDIDATE_STATUS,
  CANDIDATE_STATUS_VISIBLE_ORDER,
  getCandidateVisibleStatusBucket,
} from './recruitmentData'

export const AGE_SORT = {
  DEFAULT: 'default',
  ASC: 'asc',
  DESC: 'desc',
}

export const DEFAULT_CANDIDATE_FILTERS = {
  vacancyId: 'all',
  status: CANDIDATE_STATUS.NEW,
  ageMin: '',
  ageMax: '',
  ageSort: AGE_SORT.DEFAULT,
}

export function createDefaultCandidateFilters() {
  return { ...DEFAULT_CANDIDATE_FILTERS }
}

export function formatCandidatesCount(count) {
  const n = Number(count) || 0
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} кандидат`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${n} кандидата`
  }
  return `${n} кандидатов`
}

function matchesAgeFilter(candidate, ageMin, ageMax) {
  const hasMin = ageMin !== '' && ageMin != null
  const hasMax = ageMax !== '' && ageMax != null
  if (!hasMin && !hasMax) return true

  const age = candidate.age
  if (age == null || age === '') return false

  const min = hasMin ? Number(ageMin) : null
  const max = hasMax ? Number(ageMax) : null
  if (min != null && !Number.isNaN(min) && age < min) return false
  if (max != null && !Number.isNaN(max) && age > max) return false
  return true
}

export function filterCandidates(candidates, filters, searchQuery = '') {
  const q = String(searchQuery || '').trim().toLowerCase()

  return (candidates || []).filter((candidate) => {
    if (filters.vacancyId !== 'all' && candidate.vacancyId !== filters.vacancyId) {
      return false
    }

    if (filters.status && filters.status !== 'all') {
      if (getCandidateVisibleStatusBucket(candidate.status) !== filters.status) return false
    }

    if (!matchesAgeFilter(candidate, filters.ageMin, filters.ageMax)) return false

    if (q) {
      const hay = `${candidate.fullName} ${candidate.phone}`.toLowerCase()
      if (!hay.includes(q)) return false
    }

    return true
  })
}

export function sortCandidates(candidates, ageSort = AGE_SORT.DEFAULT) {
  const list = [...(candidates || [])]

  if (ageSort === AGE_SORT.ASC) {
    return list.sort((a, b) => {
      const ageA = a.age ?? Number.POSITIVE_INFINITY
      const ageB = b.age ?? Number.POSITIVE_INFINITY
      if (ageA !== ageB) return ageA - ageB
      return compareBySubmittedDesc(a, b)
    })
  }

  if (ageSort === AGE_SORT.DESC) {
    return list.sort((a, b) => {
      const ageA = a.age ?? Number.NEGATIVE_INFINITY
      const ageB = b.age ?? Number.NEGATIVE_INFINITY
      if (ageA !== ageB) return ageB - ageA
      return compareBySubmittedDesc(a, b)
    })
  }

  return list.sort(compareBySubmittedDesc)
}

function compareBySubmittedDesc(a, b) {
  return new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)
}

export function cycleAgeSort(current) {
  if (current === AGE_SORT.DEFAULT) return AGE_SORT.ASC
  if (current === AGE_SORT.ASC) return AGE_SORT.DESC
  return AGE_SORT.DEFAULT
}

/** Status is the always-visible primary control, not counted as a "secondary" filter. */
export function countActiveCandidateFilters(filters) {
  let count = 0
  if (filters.vacancyId !== 'all') count += 1
  if (filters.ageMin !== '' && filters.ageMin != null) count += 1
  if (filters.ageMax !== '' && filters.ageMax != null) count += 1
  return count
}

/** Per-visible-status counts among the given candidates (ignoring the status filter itself). */
export function countCandidatesByVisibleStatus(candidates) {
  const counts = {}
  for (const status of CANDIDATE_STATUS_VISIBLE_ORDER) counts[status] = 0
  for (const c of candidates || []) {
    const bucket = getCandidateVisibleStatusBucket(c.status)
    counts[bucket] = (counts[bucket] || 0) + 1
  }
  return counts
}

export function hasActiveCandidateFilters(filters) {
  return countActiveCandidateFilters(filters) > 0
}

function newest(list) {
  return list.reduce(
    (latest, c) =>
      !latest || new Date(c.submittedAt || 0) > new Date(latest.submittedAt || 0) ? c : latest,
    list[0]
  )
}

/**
 * A person can have multiple "current" applications at once (one per
 * vacancy they applied to), so pick the newest among those; only fall back
 * to the newest overall when the group has no current application at all.
 */
function pickRepresentativeApplication(group) {
  const currentOnes = group.filter((c) => c.isCurrentApplication)
  return newest(currentOnes.length > 0 ? currentOnes : group)
}

/**
 * Groups applications by person into one representative row each — the
 * current application if the group has one, else the newest — with the
 * group's other applications kept for the detail-view history. Candidates
 * without a person_id (not backfilled yet) each get their own single-row group.
 */
export function groupCandidatesByPerson(candidates, ageSort = AGE_SORT.DEFAULT) {
  const groups = new Map()
  for (const c of candidates || []) {
    const key = c.personId || `unlinked:${c.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(c)
  }

  const rows = []
  for (const group of groups.values()) {
    const representative = pickRepresentativeApplication(group)
    rows.push({
      candidate: representative,
      applicationCount: group.length,
      otherApplications: group.filter((c) => c.id !== representative.id),
    })
  }

  const sortedRepresentatives = sortCandidates(rows.map((r) => r.candidate), ageSort)
  const rowByCandidateId = new Map(rows.map((r) => [r.candidate.id, r]))
  return sortedRepresentatives.map((c) => rowByCandidateId.get(c.id))
}

/** Per-visible-status counts by unique person (one bucket per representative application). */
export function countPeopleByVisibleStatus(candidates) {
  const counts = {}
  for (const status of CANDIDATE_STATUS_VISIBLE_ORDER) counts[status] = 0
  for (const row of groupCandidatesByPerson(candidates)) {
    const bucket = getCandidateVisibleStatusBucket(row.candidate.status)
    counts[bucket] = (counts[bucket] || 0) + 1
  }
  return counts
}

export function buildCandidateFilterChips(filters, vacancies = []) {
  const chips = []

  if (filters.vacancyId !== 'all') {
    const vacancy = vacancies.find((item) => item.id === filters.vacancyId)
    chips.push({
      id: 'vacancy',
      label: vacancy?.title || 'Вакансия',
    })
  }

  if (filters.ageMin !== '' && filters.ageMin != null) {
    if (filters.ageMax !== '' && filters.ageMax != null) {
      chips.push({
        id: 'age',
        label: `Возраст: ${filters.ageMin}–${filters.ageMax}`,
      })
    } else {
      chips.push({
        id: 'ageMin',
        label: `Возраст от ${filters.ageMin}`,
      })
    }
  } else if (filters.ageMax !== '' && filters.ageMax != null) {
    chips.push({
      id: 'ageMax',
      label: `Возраст до ${filters.ageMax}`,
    })
  }

  return chips
}

/** Map of personId -> number of applications, for the "N заявок" indicator. */
export function buildPersonApplicationCounts(candidates) {
  const counts = new Map()
  for (const c of candidates || []) {
    if (!c.personId) continue
    counts.set(c.personId, (counts.get(c.personId) || 0) + 1)
  }
  return counts
}

/** Other applications by the same person (any vacancy), newest first, excluding the given one. */
export function getOtherApplicationsForPerson(candidates, candidate) {
  if (!candidate?.personId) return []
  return (candidates || [])
    .filter((c) => c.personId === candidate.personId && c.id !== candidate.id)
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
}

export function removeCandidateFilterChip(filters, chipId) {
  const next = { ...filters }
  if (chipId === 'vacancy') next.vacancyId = 'all'
  if (chipId === 'age' || chipId === 'ageMin' || chipId === 'ageMax') {
    next.ageMin = ''
    next.ageMax = ''
  }
  return next
}
