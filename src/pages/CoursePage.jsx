import { useState } from 'react'
import { useParams, Link, Navigate, useLocation } from 'react-router-dom'
import { getUser, getCourseProgress } from '../utils/storage'
import { markLessonComplete } from '../services/academyDataService'
import { useAcademyData } from '../context/AcademyDataContext'
import { resolveCourseAccess, ACCESS_REASON } from '../utils/auth'
import {
  getCourseLessons,
  getCourseTest,
  calcLessonProgress,
  areAllLessonsComplete,
  getCourseCompletionStatus,
} from '../utils/courseStructure'
import { getCategoryLabel } from '../utils/i18n'
import Header from '../components/Header'
import AccessDenied from '../components/AccessDenied'
import CourseLessonList from '../components/CourseLessonList'
import LessonVideo from '../components/LessonVideo'
import CourseTest from '../components/CourseTest'
import ProgressBar from '../components/ProgressBar'
import StatusBadge from '../components/admin/StatusBadge'
import './CoursePage.css'

/**
 * Страница курса — список видеоуроков, конспект, прогресс
 */
export default function CoursePage() {
  const { id } = useParams()
  const location = useLocation()
  const courseId = Number(id)
  const user = getUser()
  const { reload } = useAcademyData()

  const access = resolveCourseAccess(user, courseId)

  const [progress, setProgress] = useState(() =>
    user
      ? getCourseProgress(user.id, courseId)
      : { completedLessons: [], testPassed: false, testScore: null }
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
  const lessons = getCourseLessons(courseId)
  const courseTest = getCourseTest(courseId)
  const progressPercent = calcLessonProgress(progress.completedLessons, courseId)
  const courseStatus = getCourseCompletionStatus(progress.completedLessons, courseId)
  const allLessonsDone = areAllLessonsComplete(progress.completedLessons, courseId)
  const roleLabel = getCategoryLabel(course.category)
  const isLessonCompleted = activeLesson
    ? progress.completedLessons.includes(activeLesson.id)
    : false

  function refreshProgress() {
    setProgress(getCourseProgress(user.id, courseId))
  }

  async function handleMarkComplete() {
    if (!activeLesson) return
    await markLessonComplete(user.id, courseId, activeLesson.id)
    await reload()
    refreshProgress()
  }

  return (
    <div className="course-page">
      <Header />

      <main className="course-page__main container">
        <Link to="/dashboard" className="course-page__back">
          ← Назад к моим курсам
        </Link>

        <div className="course-page__header">
          <div
            className="course-page__banner"
            style={{ backgroundColor: course.imageColor }}
          />
          <div className="course-page__info">
            <div className="course-page__badges">
              <span className="course-page__role-badge">Для: {roleLabel}</span>
              <StatusBadge label={courseStatus.label} type={courseStatus.type} />
            </div>
            <h1 className="course-page__title">{course.title}</h1>
            <p className="course-page__desc">{course.description}</p>
            <div className="course-page__meta">
              <span>{course.duration}</span>
              <span>{lessons.length} уроков</span>
            </div>
          </div>
        </div>

        <div className="course-page__progress-section">
          <ProgressBar
            percent={progressPercent}
            label={`Прогресс: ${progress.completedLessons.length} из ${lessons.length} уроков (${progressPercent}%)`}
          />
        </div>

        <div className="course-page__layout">
          <section className="course-page__sidebar">
            <h2 className="course-page__section-title">Уроки курса</h2>
            <CourseLessonList
              lessons={lessons}
              completedLessons={progress.completedLessons}
              activeLessonId={activeLesson?.id}
              onSelectLesson={setActiveLesson}
            />
          </section>

          <section className="course-page__content">
            {activeLesson ? (
              <div className="course-page__lesson-view">
                <div className="course-page__lesson-header">
                  <div>
                    <h2 className="course-page__lesson-title">{activeLesson.title}</h2>
                    {activeLesson.description && (
                      <p className="course-page__lesson-desc">{activeLesson.description}</p>
                    )}
                  </div>
                  <span className="course-page__lesson-duration">
                    {activeLesson.durationMinutes} мин
                    {activeLesson.mandatory && ' · Обязательный'}
                  </span>
                </div>

                <LessonVideo videoUrl={activeLesson.videoUrl} title={activeLesson.title} />

                {activeLesson.summary && (
                  <div className="course-page__summary">
                    <h3>Конспект урока</h3>
                    <p>{activeLesson.summary}</p>
                  </div>
                )}

                <div className="course-page__lesson-actions">
                  {isLessonCompleted ? (
                    <span className="course-page__completed-badge">✓ Урок пройден</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleMarkComplete}
                    >
                      Отметить урок пройденным
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="course-page__placeholder">
                <p>Выберите урок из списка слева, чтобы начать обучение.</p>
              </div>
            )}
          </section>
        </div>

        {courseTest && (
          <section className="course-page__test">
            <CourseTest
              test={courseTest}
              userId={user.id}
              courseId={courseId}
              disabled={!allLessonsDone}
              onComplete={refreshProgress}
            />
          </section>
        )}
      </main>
    </div>
  )
}
