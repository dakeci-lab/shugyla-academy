import './LessonList.css'

/**
 * Список уроков курса с отметками о прохождении
 */
export default function LessonList({ lessons, completedLessons, onStartLesson }) {
  return (
    <ul className="lesson-list">
      {lessons.map((lesson) => {
        const isCompleted = completedLessons.includes(lesson.id)
        return (
          <li key={lesson.id} className="lesson-list__item">
            <div className="lesson-list__info">
              <span className={`lesson-list__status ${isCompleted ? 'lesson-list__status--done' : ''}`}>
                {isCompleted ? '✓' : lesson.order}
              </span>
              <div>
                <span className="lesson-list__title">{lesson.title}</span>
                <span className="lesson-list__duration">{lesson.duration}</span>
              </div>
            </div>
            <button
              className="btn btn--outline btn--sm"
              onClick={() => onStartLesson(lesson)}
            >
              {isCompleted ? 'Повторить' : 'Начать урок'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
