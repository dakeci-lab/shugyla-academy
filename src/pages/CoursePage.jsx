import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getAllCourses } from '../utils/adminData'
import { LESSONS } from '../data/lessons'
import { TESTS } from '../data/tests'
import { getUser, getCourseProgress, markLessonComplete } from '../utils/storage'
import { canAccessCourse } from '../utils/auth'
import Header from '../components/Header'
import AccessDenied from '../components/AccessDenied'
import LessonList from '../components/LessonList'
import ProgressBar from '../components/ProgressBar'
import './CoursePage.css'

/**
 * Страница курса — /courses/:id
 * Показывает описание, уроки, прогресс и кнопку теста
 */
export default function CoursePage() {
  const { id } = useParams()
  const courseId = Number(id)
  const course = getAllCourses().find((c) => c.id === courseId)
  const user = getUser()

  const [progress, setProgress] = useState(() =>
    user ? getCourseProgress(user.id, courseId) : { completedLessons: [], testPassed: false }
  )
  const [activeLesson, setActiveLesson] = useState(null)

  if (!course) {
    return (
      <div className="course-page">
        <Header />
        <main className="container course-page__not-found">
          <h1>Курс не найден</h1>
          <Link to="/academy" className="btn btn--primary">На главную</Link>
        </main>
      </div>
    )
  }

  // Проверка доступа по роли — показываем страницу «Нет доступа»
  if (user && !canAccessCourse(user.role, course)) {
    return <AccessDenied course={course} userRole={user.role} />
  }

  const courseLessons = LESSONS
    .filter((l) => l.courseId === courseId)
    .sort((a, b) => a.order - b.order)

  const courseTest = TESTS.find((t) => t.courseId === courseId)

  const progressPercent = courseLessons.length > 0
    ? Math.round((progress.completedLessons.length / courseLessons.length) * 100)
    : 0

  // «Начать урок» — отмечаем урок пройденным (MVP-заглушка)
  function handleStartLesson(lesson) {
    setActiveLesson(lesson)
    if (user) {
      markLessonComplete(user.id, courseId, lesson.id)
      setProgress(getCourseProgress(user.id, courseId))
    }
  }

  return (
    <div className="course-page">
      <Header />

      <main className="course-page__main container">
        <Link to={user ? '/dashboard' : '/academy'} className="course-page__back">
          ← Назад
        </Link>

        <div className="course-page__header">
          <div
            className="course-page__banner"
            style={{ backgroundColor: course.imageColor }}
          />
          <div className="course-page__info">
            <h1 className="course-page__title">{course.title}</h1>
            <p className="course-page__desc">{course.description}</p>
            <div className="course-page__meta">
              <span>{course.duration}</span>
              <span>{courseLessons.length} уроков</span>
            </div>
          </div>
        </div>

        <div className="course-page__progress-section">
          <ProgressBar
            percent={progressPercent}
            label="Прогресс курса"
          />
        </div>

        {/* Активный урок (MVP — просто показываем название) */}
        {activeLesson && (
          <div className="course-page__active-lesson">
            <h3>Урок: {activeLesson.title}</h3>
            <p>Здесь будет содержимое урока. Пока урок отмечен как пройденный.</p>
            <button
              className="btn btn--outline btn--sm"
              onClick={() => setActiveLesson(null)}
            >
              Закрыть
            </button>
          </div>
        )}

        <section className="course-page__lessons">
          <h2 className="course-page__section-title">Уроки</h2>
          <LessonList
            lessons={courseLessons}
            completedLessons={progress.completedLessons}
            onStartLesson={handleStartLesson}
          />
        </section>

        {courseTest && (
          <section className="course-page__test">
            <h2 className="course-page__section-title">Итоговый тест</h2>
            <div className="course-page__test-card">
              <div>
                <strong>{courseTest.title}</strong>
                <p className="course-page__test-info">
                  {courseTest.questions.length} вопросов · проходной балл {courseTest.passingScore}%
                </p>
              </div>
              <button className="btn btn--primary" disabled={progressPercent < 100}>
                Пройти тест
              </button>
            </div>
            {progressPercent < 100 && (
              <p className="course-page__test-hint">
                Пройдите все уроки, чтобы открыть тест.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
