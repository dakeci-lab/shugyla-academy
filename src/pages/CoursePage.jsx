import { useState } from 'react'
import { useParams, Link, Navigate, useLocation } from 'react-router-dom'
import { LESSONS } from '../data/lessons'
import { TESTS } from '../data/tests'
import { getUser, getCourseProgress, markLessonComplete } from '../utils/storage'
import { resolveCourseAccess, ACCESS_REASON } from '../utils/auth'
import Header from '../components/Header'
import AccessDenied from '../components/AccessDenied'
import LessonList from '../components/LessonList'
import ProgressBar from '../components/ProgressBar'
import './CoursePage.css'

/**
 * Страница курса — /courses/:id
 * Требует авторизацию; проверяет allowedRoles по роли пользователя.
 */
export default function CoursePage() {
  const { id } = useParams()
  const location = useLocation()
  const courseId = Number(id)
  const user = getUser()

  const access = resolveCourseAccess(user, courseId)

  const [progress, setProgress] = useState(() =>
    user ? getCourseProgress(user.id, courseId) : { completedLessons: [], testPassed: false }
  )
  const [activeLesson, setActiveLesson] = useState(null)

  if (access.reason === ACCESS_REASON.NOT_FOUND) {
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

  if (access.reason === ACCESS_REASON.UNAUTHENTICATED) {
    const redirect = encodeURIComponent(location.pathname)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  if (access.reason === ACCESS_REASON.FORBIDDEN) {
    return <AccessDenied course={access.course} userRole={user.role} />
  }

  const course = access.course

  const courseLessons = LESSONS
    .filter((l) => l.courseId === courseId)
    .sort((a, b) => a.order - b.order)

  const courseTest = TESTS.find((t) => t.courseId === courseId)

  const progressPercent = courseLessons.length > 0
    ? Math.round((progress.completedLessons.length / courseLessons.length) * 100)
    : 0

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
        <Link to="/dashboard" className="course-page__back">
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
