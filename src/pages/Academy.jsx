import { useState } from 'react'
import { getAllCourses } from '../utils/adminData'
import { useLanguage } from '../context/LanguageContext'
import Header from '../components/Header'
import Hero from '../components/Hero'
import CategoryFilter from '../components/CategoryFilter'
import CourseCard from '../components/CourseCard'
import VacanciesPublicBlock from '../components/VacanciesPublicBlock'
import PWAInstallPrompt from '../components/PWAInstallPrompt'
import './Academy.css'

/** Главная страница академии — hero, фильтры и сетка курсов */
export default function Academy() {
  const [activeCategory, setActiveCategory] = useState('all')
  const { t } = useLanguage()

  const courses = getAllCourses()

  const filteredCourses =
    activeCategory === 'all'
      ? courses
      : courses.filter((c) => c.category === activeCategory)

  return (
    <div className="academy-page">
      <Header variant="landing" />
      <Hero />

      <div className="container">
        <PWAInstallPrompt />
      </div>

      <section id="courses" className="academy-page__catalog">
        <div className="container">
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
              <CourseCard key={course.id} course={course} />
            ))}
          </div>

          {filteredCourses.length === 0 && (
            <p className="academy-page__empty">{t.emptyCourses}</p>
          )}
        </div>
      </section>

      <VacanciesPublicBlock />
    </div>
  )
}
