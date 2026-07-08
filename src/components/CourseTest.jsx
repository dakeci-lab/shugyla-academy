import { useState } from 'react'
import { getCourseProgress } from '../utils/storage'
import { saveTestResult } from '../services/academyDataService'
import { useAcademyData } from '../context/AcademyDataContext'
import './CourseTest.css'

/**
 * Итоговый тест курса — вопросы с вариантами, результат в localStorage
 */
export default function CourseTest({ test, userId, courseId, disabled, onComplete }) {
  const saved = getCourseProgress(userId, courseId)
  const { reload } = useAcademyData()

  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState(null)
  const [retrying, setRetrying] = useState(false)

  const showSavedResult = saved.testScore !== null && !submitted && !retrying

  function selectAnswer(questionId, optionIndex) {
    if (submitted || disabled) return
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (disabled) return

    const unanswered = test.questions.filter((q) => answers[q.id] === undefined)
    if (unanswered.length > 0) return

    let correct = 0
    test.questions.forEach((q) => {
      if (answers[q.id] === q.correct) correct++
    })

    const score = Math.round((correct / test.questions.length) * 100)
    const passed = score >= test.passingScore

    await saveTestResult(userId, courseId, score, passed)
    await reload()
    setResult({ score, passed, correct, total: test.questions.length })
    setSubmitted(true)
    setRetrying(false)
    onComplete?.()
  }

  function handleRetry() {
    setAnswers({})
    setSubmitted(false)
    setResult(null)
    setRetrying(true)
  }

  const displayResult = submitted ? result : showSavedResult
    ? { score: saved.testScore, passed: saved.testPassed }
    : null

  return (
    <div className="course-test">
      <div className="course-test__header">
        <div>
          <h2 className="course-test__title">{test.title}</h2>
          <p className="course-test__info">
            {test.questions.length} вопросов · проходной балл {test.passingScore}%
          </p>
        </div>
        {saved.testPassed && (
          <span className="course-test__badge course-test__badge--passed">Тест сдан</span>
        )}
      </div>

      {disabled && (
        <p className="course-test__locked">
          Пройдите все уроки курса, чтобы открыть тест.
        </p>
      )}

      {displayResult && (
        <div
          className={`course-test__result ${
            displayResult.passed
              ? 'course-test__result--passed'
              : 'course-test__result--failed'
          }`}
        >
          <strong>
            {displayResult.passed ? 'Тест сдан' : 'Нужно пройти повторно'}
          </strong>
          <p>
            Ваш результат: {displayResult.score}%
            {displayResult.correct !== undefined && (
              <> ({displayResult.correct} из {displayResult.total} правильных)</>
            )}
          </p>
          {!displayResult.passed && !disabled && (
            <button type="button" className="btn btn--outline btn--sm" onClick={handleRetry}>
              Пройти снова
            </button>
          )}
        </div>
      )}

      {!disabled && (!displayResult || !displayResult.passed) && (
        <form className="course-test__form" onSubmit={handleSubmit}>
          {test.questions.map((question, qIndex) => (
            <fieldset key={question.id} className="course-test__question">
              <legend>
                {qIndex + 1}. {question.text}
              </legend>
              <div className="course-test__options">
                {question.options.map((option, optIndex) => (
                  <label
                    key={optIndex}
                    className={`course-test__option ${
                      answers[question.id] === optIndex
                        ? 'course-test__option--selected'
                        : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${question.id}`}
                      checked={answers[question.id] === optIndex}
                      onChange={() => selectAnswer(question.id, optIndex)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <button
            type="submit"
            className="btn btn--primary"
            disabled={test.questions.some((q) => answers[q.id] === undefined)}
          >
            Завершить тест
          </button>
        </form>
      )}
    </div>
  )
}
