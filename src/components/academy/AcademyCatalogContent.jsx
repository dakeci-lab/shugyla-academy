import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllCourses } from '../../utils/adminData'
import { useLanguage } from '../../context/LanguageContext'
import CategoryFilter from '../CategoryFilter'
import CourseCard from '../CourseCard'
import '../../pages/Academy.css'

/** Каталог курсов — внутри PlatformLayout, без лендинга */
export default function AcademyCatalogContent() {
  const [activeCategory, setActiveCategory] = useState('all')
  const { t } = useLanguage()

  const courses = getAllCourses()

  const filteredCourses =
    activeCategory === 'all'
      ? courses
      : courses.filter((c) => c.category === activeCategory)

  return (
    <div className="academy-page academy-page--embedded">
      <div className="academy-page__catalog">
        <div className="academy-page__catalog-top">
          <Link to="/platform/academy" className="btn btn--ghost btn--sm">
            ← Academy
          </Link>
        </div>

        <div className="academy-page__intro">
          <div>
            <h2 className="academy-page__heading">{t.coursesHeading}</h2>
            <p className="academy-page__subheading">{t.coursesSubheading}</p>
          </div>
          <span className="academy-page__count">
            {filteredCourses.length} {t.coursesCount}
          </span>
        </div>

        <CategoryFilter active={activeCategory} onChange={setActiveCategory} />

        <div className="academy-page__grid">
          {filteredCourses.map((course) => (
            <CourseCard key={course.id} course={course} courseBasePath="/platform/courses" />
          ))}
        </div>

        {filteredCourses.length === 0 && (
          <p className="academy-page__empty">{t.emptyCourses}</p>
        )}
      </div>
    </div>
  )
}
