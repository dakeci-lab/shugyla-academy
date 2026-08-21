/** Avoid showing identical title and position name on public cards. */
export function getPublicVacancyDisplay(vacancy) {
  const title = String(vacancy?.title || '').trim()
  const positionName = String(vacancy?.positionName || '').trim()
  const showPosition =
    Boolean(positionName) &&
    positionName.localeCompare(title, undefined, { sensitivity: 'accent' }) !== 0

  return {
    title: title || positionName || 'Вакансия',
    positionName: showPosition ? positionName : '',
    description: String(vacancy?.description || '').trim(),
  }
}

export function formatVacancySalary(vacancy, t, lang = 'ru') {
  const from = vacancy?.salaryFrom
  const to = vacancy?.salaryTo
  const note = String(vacancy?.salaryNote || '').trim()
  const formatter = new Intl.NumberFormat(lang === 'kz' ? 'kk-KZ' : 'ru-RU', {
    maximumFractionDigits: 0,
  })

  let range = ''
  if (from != null && to != null) {
    range = `${formatter.format(from)}–${formatter.format(to)} ${t.vacancySalaryCurrency}`
  } else if (from != null) {
    range = `${t.vacancySalaryFrom} ${formatter.format(from)} ${t.vacancySalaryCurrency}`
  } else if (to != null) {
    range = `${t.vacancySalaryTo} ${formatter.format(to)} ${t.vacancySalaryCurrency}`
  }

  if (range && note) return `${range} · ${note}`
  return range || note
}

export function getPublicVacancyFacts(vacancy, t, lang = 'ru', { compact = false } = {}) {
  const salary = formatVacancySalary(vacancy, t, lang)
  const employment = vacancy?.employmentType
    ? t.employmentTypes[vacancy.employmentType] || vacancy.employmentType
    : ''
  const experience = vacancy?.experienceRequirement
    ? t.experienceRequirements[vacancy.experienceRequirement] ||
      vacancy.experienceRequirement
    : ''

  const facts = compact
    ? [
        {
          key: 'location',
          label: [t.vacancyStore, t.vacancyCity].join(' / '),
          value: [vacancy?.storeName, vacancy?.city].filter(Boolean).join(', '),
        },
        { key: 'salary', label: t.vacancySalary, value: salary },
        { key: 'schedule', label: t.vacancySchedule, value: vacancy?.schedule },
        { key: 'experience', label: t.vacancyExperience, value: experience },
      ]
    : [
        { key: 'store', label: t.vacancyStore, value: vacancy?.storeName },
        { key: 'city', label: t.vacancyCity, value: vacancy?.city },
        { key: 'address', label: t.vacancyAddress, value: vacancy?.storeAddress },
        { key: 'salary', label: t.vacancySalary, value: salary },
        { key: 'schedule', label: t.vacancySchedule, value: vacancy?.schedule },
        { key: 'employment', label: t.vacancyEmployment, value: employment },
        { key: 'experience', label: t.vacancyExperience, value: experience },
      ]

  return facts.filter((fact) => String(fact.value || '').trim())
}

/**
 * Content blocks for public vacancy detail — only from published fields.
 * No invented copy when description / experience / offer facts are absent.
 *
 * Mapping:
 * - duties («Что нужно делать») ← description
 * - expectations («Что мы ожидаем») ← experienceRequirement
 * - offers («Что предлагаем») ← salary / schedule / employment (only if set)
 */
export function getPublicVacancyContentBlocks(vacancy, t, lang = 'ru') {
  const description = String(vacancy?.description || '').trim()
  const experience = vacancy?.experienceRequirement
    ? t.experienceRequirements[vacancy.experienceRequirement] ||
      vacancy.experienceRequirement
    : ''
  const salary = formatVacancySalary(vacancy, t, lang)
  const schedule = String(vacancy?.schedule || '').trim()
  const employment = vacancy?.employmentType
    ? t.employmentTypes[vacancy.employmentType] || vacancy.employmentType
    : ''

  let duties = null
  if (description) {
    const lines = description
      .split(/\n+/)
      .map((line) => line.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean)
    duties =
      lines.length > 1
        ? {
            key: 'duties',
            title: t.careersVacancyDutiesTitle,
            lines,
            text: null,
          }
        : {
            key: 'duties',
            title: t.careersVacancyDutiesTitle,
            lines: null,
            text: lines[0] || description,
          }
  }

  const expectations = experience
    ? {
        key: 'expectations',
        title: t.careersVacancyExpectTitle,
        lines: [experience],
      }
    : null

  const offerLines = []
  if (salary) offerLines.push(salary)
  if (schedule) offerLines.push(schedule)
  if (employment) offerLines.push(employment)

  const offers = offerLines.length
    ? {
        key: 'offers',
        title: t.careersVacancyOfferTitle,
        lines: offerLines,
      }
    : null

  return { duties, expectations, offers }
}

/** Compact pills for vacancy detail header (city / employment / schedule). */
export function getPublicVacancyPills(vacancy, t) {
  const employment = vacancy?.employmentType
    ? t.employmentTypes[vacancy.employmentType] || vacancy.employmentType
    : ''
  const pills = [
    { key: 'city', value: String(vacancy?.city || '').trim() },
    { key: 'employment', value: employment },
    { key: 'schedule', value: String(vacancy?.schedule || '').trim() },
  ]
  return pills.filter((pill) => pill.value)
}
