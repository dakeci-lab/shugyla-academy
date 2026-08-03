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
