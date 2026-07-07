import './BlockList.css'

/**
 * Список блоков курса с вложенными уроками
 */
export default function BlockList({ blocks, completedLessons, onStartLesson }) {
  return (
    <div className="block-list">
      {blocks.map((block, blockIndex) => {
        const blockLessons = block.lessons || []
        const completedInBlock = blockLessons.filter((l) =>
          completedLessons.includes(l.id)
        ).length

        return (
          <section key={block.id} className="block-list__block">
            <header className="block-list__header">
              <div>
                <h3 className="block-list__title">{block.title}</h3>
                <p className="block-list__meta">
                  {completedInBlock} / {blockLessons.length} уроков пройдено
                </p>
              </div>
              <span className="block-list__index">{blockIndex + 1}</span>
            </header>

            <ul className="block-list__lessons">
              {blockLessons.map((lesson) => {
                const isCompleted = completedLessons.includes(lesson.id)
                return (
                  <li key={lesson.id} className="block-list__lesson">
                    <div className="block-list__lesson-info">
                      <span
                        className={`block-list__status ${
                          isCompleted ? 'block-list__status--done' : ''
                        }`}
                      >
                        {isCompleted ? '✓' : lesson.order}
                      </span>
                      <div>
                        <span className="block-list__lesson-title">
                          Урок {lesson.order}: {lesson.title}
                        </span>
                        <span className="block-list__lesson-duration">
                          {lesson.duration}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={() => onStartLesson(lesson)}
                    >
                      {isCompleted ? 'Повторить' : 'Пройти урок'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
