import { useState } from 'react'
import { COURSES } from '../data/courses'
import Header from '../components/Header'
import Hero from '../components/Hero'
import CategoryFilter from '../components/CategoryFilter'
import CourseCard from '../components/CourseCard'
import './Academy.css'

/**
 * Главная страница академии — /academy
 * Показывает hero-блок, фильтр категорий и сетку курсов
 */
export default function Academy() {
  const [activeCategory, setActiveCategory] = useState('all')

  // Фильтрация курсов по выбранной категории
  const filteredCourses =
    activeCategory === 'all'
      ? COURSES
      : COURSES.filter((c) => c.category === activeCategory)

  return (
    <div className="academy-page">
      <Header />
      <Hero />

      <main className="academy-page__main container">
        <h2 className="academy-page__heading">Курсы обучения</h2>
        <CategoryFilter active={activeCategory} onChange={setActiveCategory} />

        <div className="academy-page__grid">
          {filteredCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>

        {filteredCourses.length === 0 && (
          <p className="academy-page__empty">Курсы в этой категории пока не добавлены.</p>
        )}
      </main>
    </div>
  )
}
