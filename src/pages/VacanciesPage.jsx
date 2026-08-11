import { CareersHomeRedirect } from '../router/SurfaceRedirect'

/** Legacy `/vacancies` alias. The list is rendered only by ApplyHubPage. */
export default function VacanciesPage() {
  return <CareersHomeRedirect />
}
