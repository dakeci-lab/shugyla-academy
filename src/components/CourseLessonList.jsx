import './CourseLessonList.css'

/**
 * Список уроков курса для сотрудника
 */
export default function CourseLessonList({
  lessons,
  completedLessons,
  activeLessonId,
  onSelectLesson,
}) {
  if (lessons.length === 0) {
    return <p className="course-lesson-list__empty">Уроки пока не добавлены.</p>
  }

  return (
    <ul className="course-lesson-list">
      {lessons.map((lesson, index) => {
        const isCompleted = completedLessons.includes(lesson.id)
        const isActive = activeLessonId === lesson.id

        return (
          <li key={lesson.id}>
            <button
              type="button"
              className={`course-lesson-list__item ${isActive ? 'course-lesson-list__item--active' : ''} ${isCompleted ? 'course-lesson-list__item--done' : ''}`}
              onClick={() => onSelectLesson(lesson)}
            >
              <span className="course-lesson-list__index">
                {isCompleted ? '✓' : index + 1}
              </span>
              <span className="course-lesson-list__body">
                <span className="course-lesson-list__title">{lesson.title}</span>
                <span className="course-lesson-list__meta">
                  {lesson.durationMinutes} мин
                  {lesson.mandatory && ' · Обязательный'}
                  {lesson.videoUrl && ' · Видео'}
                </span>
              </span>
              {isCompleted && (
                <span className="course-lesson-list__badge">Пройден</span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
