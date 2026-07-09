import CoursesSection from './sections/CoursesSection'
import LearningPathsSection from './sections/LearningPathsSection'
import StandardsSection from './sections/StandardsSection'
import RecruitmentSection from './sections/RecruitmentSection'
import TestsSection from './sections/TestsSection'
import CertificationSection from './sections/CertificationSection'
import ProgressSection from './sections/ProgressSection'

/** Контент раздела управления Academy (без отдельного layout) */
export default function AdminSectionContent({ section }) {
  switch (section) {
    case 'courses':
      return <CoursesSection />
    case 'routes':
      return <LearningPathsSection />
    case 'standards':
      return <StandardsSection />
    case 'hiring':
      return <RecruitmentSection />
    case 'tests':
      return <TestsSection />
    case 'attestation':
      return <CertificationSection />
    case 'progress':
      return <ProgressSection />
    default:
      return null
  }
}
