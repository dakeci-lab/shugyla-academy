import { useState } from 'react'
import {
  submitTestAttempt,
  getUserAttemptsForTest,
  hasPassedTest,
  getBestAttempt,
} from '../services/academyDataService'
import { useAcademyData } from '../context/AcademyDataContext'
import '../components/CourseTest.css'

/**
 * Универсальный компонент прохождения теста
 */
export default function TestRunner({
  test,
  userId,
  courseId = null,
  testType = 'course_test',
  disabled = false,
  lockedMessage = 'Тест пока недоступен.',
  onComplete,
}) {
  const { reload } = useAcademyData()
  const attempts = getUserAttemptsForTest(userId, test.id)
  const best = getBestAttempt(userId, test.id)
  const alreadyPassed = hasPassedTest(userId, test.id)

  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState(null)
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const canRetry =
    !alreadyPassed &&
    (!test.maxAttempts || attempts.length < test.maxAttempts)

  const showSavedResult =
    (alreadyPassed || best) && !submitted && !retrying

  function selectAnswer(questionId, optionIndex) {
    if (submitted || disabled || loading) return
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (disabled || loading) return

    const unanswered = test.questions.filter((q) => answers[q.id] === undefined)
    if (unanswered.length > 0) return

    setLoading(true)
    setError('')

    try {
      const attemptResult = await submitTestAttempt({
        userId,
        testId: test.id,
        courseId,
        type: testType,
        answers,
      })

      setResult({
        score: attemptResult.scorePercent,
        passed: attemptResult.passed,
        correct: attemptResult.correctCount,
        total: attemptResult.totalQuestions,
      })
      setSubmitted(true)
      setRetrying(false)
      await reload()
      onComplete?.(attemptResult)
    } catch (err) {
      setError(err.message || 'Не удалось отправить тест')
    } finally {
      setLoading(false)
    }
  }

  function handleRetry() {
    setAnswers({})
    setSubmitted(false)
    setResult(null)
    setRetrying(true)
    setError('')
  }

  const displayResult = submitted
    ? result
    : showSavedResult
      ? {
          score: best?.scorePercent ?? 0,
          passed: alreadyPassed || Boolean(best?.passed),
          correct: best?.correctCount,
          total: best?.totalQuestions,
        }
      : null

  return (
    <div className="course-test">
      <div className="course-test__header">
        <div>
          <h2 className="course-test__title">{test.title}</h2>
          {test.description && (
            <p className="course-test__info">{test.description}</p>
          )}
          <p className="course-test__info">
            {test.questions.length} вопросов · проходной балл {test.passingScore}%
            {test.maxAttempts ? ` · попыток: ${attempts.length}/${test.maxAttempts}` : ''}
          </p>
        </div>
        {(alreadyPassed || displayResult?.passed) && (
          <span className="course-test__badge course-test__badge--passed">Тест сдан</span>
        )}
      </div>

      {disabled && (
        <p className="course-test__locked">{lockedMessage}</p>
      )}

      {displayResult && (
        <div
          className={`course-test__result ${
            displayResult.passed
              ? 'course-test__result--passed'
              : 'course-test__result--failed'
          }`}
        >
          <strong>{displayResult.passed ? 'Тест сдан' : 'Нужно пройти повторно'}</strong>
          <p>
            Ваш результат: {displayResult.score}%
            {displayResult.correct !== undefined && displayResult.total !== undefined && (
              <> ({displayResult.correct} из {displayResult.total} правильных)</>
            )}
          </p>
          <p className="course-test__info">Проходной балл: {test.passingScore}%</p>
          {!displayResult.passed && !disabled && canRetry && (
            <button type="button" className="btn btn--outline btn--sm" onClick={handleRetry}>
              Пройти ещё раз
            </button>
          )}
        </div>
      )}

      {error && <p className="course-test__error">{error}</p>}

      {!disabled && (!displayResult?.passed || retrying) && canRetry && (
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
            disabled={
              loading ||
              test.questions.some((q) => answers[q.id] === undefined)
            }
          >
            {loading ? 'Отправка…' : 'Завершить тест'}
          </button>
        </form>
      )}
    </div>
  )
}
