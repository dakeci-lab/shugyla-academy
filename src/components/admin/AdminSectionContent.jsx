import CoursesSection from './sections/CoursesSection'
import TestsSection from './sections/TestsSection'
import ProgressSection from './sections/ProgressSection'

/** Контент раздела управления Academy (без отдельного layout) */
export default function AdminSectionContent({ section }) {
  switch (section) {
    case 'courses':
      return <CoursesSection />
    case 'tests':
      return <TestsSection />
    case 'progress':
      return <ProgressSection />
    default:
      return null
  }
}
