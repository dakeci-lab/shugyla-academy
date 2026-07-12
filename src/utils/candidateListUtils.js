import {
  CANDIDATE_STATUS,
  CANDIDATE_STATUS_LABELS,
  matchesScoreFilter,
  SCORE_FILTER_OPTIONS,
} from './recruitmentData'

export const AGE_SORT = {
  DEFAULT: 'default',
  ASC: 'asc',
  DESC: 'desc',
}

export const DEFAULT_CANDIDATE_FILTERS = {
  vacancyId: 'all',
  status: 'all',
  score: 'all',
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

    if (filters.status !== 'all') {
      const status = candidate.status
      if (filters.status === CANDIDATE_STATUS.QUESTIONABLE) {
        if (status !== 'questionable' && status !== 'maybe') return false
      } else if (status !== filters.status) {
        return false
      }
    }

    if (!matchesScoreFilter(candidate, filters.score)) return false
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

export function countActiveCandidateFilters(filters) {
  let count = 0
  if (filters.vacancyId !== 'all') count += 1
  if (filters.status !== 'all') count += 1
  if (filters.score !== 'all') count += 1
  if (filters.ageMin !== '' && filters.ageMin != null) count += 1
  if (filters.ageMax !== '' && filters.ageMax != null) count += 1
  return count
}

export function hasActiveCandidateFilters(filters) {
  return countActiveCandidateFilters(filters) > 0
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

  if (filters.status !== 'all') {
    chips.push({
      id: 'status',
      label: CANDIDATE_STATUS_LABELS[filters.status] || filters.status,
    })
  }

  if (filters.score !== 'all') {
    const scoreLabel = SCORE_FILTER_OPTIONS.find((opt) => opt.id === filters.score)?.label
    chips.push({
      id: 'score',
      label: scoreLabel || 'Результат',
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

export function removeCandidateFilterChip(filters, chipId) {
  const next = { ...filters }
  if (chipId === 'vacancy') next.vacancyId = 'all'
  if (chipId === 'status') next.status = 'all'
  if (chipId === 'score') next.score = 'all'
  if (chipId === 'age' || chipId === 'ageMin' || chipId === 'ageMax') {
    next.ageMin = ''
    next.ageMax = ''
  }
  return next
}
