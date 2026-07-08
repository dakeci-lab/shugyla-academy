import { TESTS as MOCK_TESTS } from '../data/tests'
import { ROLE_IDS } from '../data/roles'

const STORAGE_KEYS = {
  TESTS: 'shugyla_tests',
  QUESTIONS: 'shugyla_test_questions',
  ATTEMPTS: 'shugyla_test_attempts',
}

function readJson(key, fallback) {
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : fallback
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function genId() {
  return crypto.randomUUID()
}

function rowToTest(row) {
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    type: row.type,
    courseId: row.courseId ?? row.course_id ?? null,
    role: row.role ?? null,
    status: row.status || 'draft',
    passingScore: row.passingScore ?? row.passing_score ?? 80,
    maxAttempts: row.maxAttempts ?? row.max_attempts ?? null,
    timeLimitMinutes: row.timeLimitMinutes ?? row.time_limit_minutes ?? null,
    questionCount: 0,
  }
}

function rowToQuestion(row) {
  return {
    id: row.id,
    testId: row.testId ?? row.test_id,
    questionText: row.questionText ?? row.question_text ?? '',
    questionType: row.questionType ?? row.question_type ?? 'single_choice',
    options: Array.isArray(row.options) ? row.options : [],
    correctOptionIndex: row.correctOptionIndex ?? row.correct_option_index ?? 0,
    explanation: row.explanation || '',
    points: row.points ?? 1,
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
  }
}

function rowToAttempt(row) {
  return {
    id: row.id,
    testId: row.testId ?? row.test_id,
    userId: row.userId ?? row.user_id,
    courseId: row.courseId ?? row.course_id ?? null,
    type: row.type,
    answers: row.answers || {},
    scorePercent: row.scorePercent ?? row.score_percent ?? 0,
    correctCount: row.correctCount ?? row.correct_count ?? 0,
    totalQuestions: row.totalQuestions ?? row.total_questions ?? 0,
    passed: Boolean(row.passed),
    startedAt: row.startedAt ?? row.started_at,
    submittedAt: row.submittedAt ?? row.submitted_at,
    createdAt: row.createdAt ?? row.created_at,
  }
}

function attachCounts(tests, questions) {
  return tests.map((t) => ({
    ...t,
    questionCount: questions.filter((q) => q.testId === t.id).length,
  }))
}

/** Seed mock tests only when localStorage is empty */
export function seedMockTestsIfEmpty() {
  const existing = readJson(STORAGE_KEYS.TESTS, [])
  if (existing.length > 0) return

  const tests = []
  const questions = []

  MOCK_TESTS.forEach((mock) => {
    const testId = genId()
    tests.push({
      id: testId,
      title: mock.title,
      description: '',
      type: 'course_test',
      courseId: mock.courseId,
      role: null,
      status: 'published',
      passingScore: mock.passingScore,
      maxAttempts: null,
      timeLimitMinutes: null,
    })

    mock.questions.forEach((q, index) => {
      questions.push({
        id: genId(),
        testId,
        questionText: q.text,
        questionType: 'single_choice',
        options: q.options,
        correctOptionIndex: q.correct,
        explanation: '',
        points: 1,
        sortOrder: index,
      })
    })
  })

  const finalId = genId()
  tests.push({
    id: finalId,
    title: 'Финальная аттестация: Кассир',
    description: 'Итоговая аттестация для подтверждения квалификации кассира Shugyla Market.',
    type: 'final_attestation',
    courseId: null,
    role: ROLE_IDS.CASHIER,
    status: 'published',
    passingScore: 80,
    maxAttempts: null,
    timeLimitMinutes: null,
  })

  const cashierFinalQuestions = [
    {
      text: 'Какой первый шаг при открытии смены кассира?',
      options: ['Проверить кассу и размен', 'Начать продажи', 'Уйти на перерыв', 'Закрыть кассу'],
      correct: 0,
    },
    {
      text: 'Что обязательно при работе с покупателем?',
      options: ['Игнорировать очередь', 'Приветствие и вежливость', 'Не выдавать чек', 'Спорить'],
      correct: 1,
    },
    {
      text: 'Когда нужно сообщить администратору о недостаче?',
      options: ['Никогда', 'Сразу при обнаружении', 'Через неделю', 'После закрытия смены'],
      correct: 1,
    },
  ]

  cashierFinalQuestions.forEach((q, index) => {
    questions.push({
      id: genId(),
      testId: finalId,
      questionText: q.text,
      questionType: 'single_choice',
      options: q.options,
      correctOptionIndex: q.correct,
      explanation: '',
      points: 1,
      sortOrder: index,
    })
  })

  writeJson(STORAGE_KEYS.TESTS, tests)
  writeJson(STORAGE_KEYS.QUESTIONS, questions)
  writeJson(STORAGE_KEYS.ATTEMPTS, [])
}

export function getLocalTestsBundle() {
  seedMockTestsIfEmpty()
  const tests = readJson(STORAGE_KEYS.TESTS, []).map(rowToTest)
  const questions = readJson(STORAGE_KEYS.QUESTIONS, []).map(rowToQuestion)
  const attempts = readJson(STORAGE_KEYS.ATTEMPTS, []).map(rowToAttempt)
  return {
    tests: attachCounts(tests, questions),
    questions,
    attempts,
  }
}

function saveTests(tests) {
  writeJson(STORAGE_KEYS.TESTS, tests)
}

function saveQuestions(questions) {
  writeJson(STORAGE_KEYS.QUESTIONS, questions)
}

function saveAttempts(attempts) {
  writeJson(STORAGE_KEYS.ATTEMPTS, attempts)
}

export function localGetTests() {
  return getLocalTestsBundle().tests
}

export function localGetTestById(testId) {
  return localGetTests().find((t) => t.id === testId) || null
}

export function localGetTestQuestions(testId) {
  return getLocalTestsBundle()
    .questions.filter((q) => q.testId === testId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function localGetUserAttempts(userId, testId = null) {
  let attempts = getLocalTestsBundle().attempts.filter((a) => a.userId === userId)
  if (testId) attempts = attempts.filter((a) => a.testId === testId)
  return attempts
}

export function localCreateTest(data) {
  const bundle = getLocalTestsBundle()
  const test = rowToTest({
    id: genId(),
    ...data,
    status: data.status || 'draft',
    passingScore: data.passingScore ?? 80,
  })
  bundle.tests.push(test)
  saveTests(bundle.tests.map(({ questionCount, ...t }) => t))
  return test.id
}

export function localUpdateTest(testId, updates) {
  const bundle = getLocalTestsBundle()
  const idx = bundle.tests.findIndex((t) => t.id === testId)
  if (idx < 0) throw new Error('Тест не найден')
  bundle.tests[idx] = rowToTest({ ...bundle.tests[idx], ...updates })
  saveTests(bundle.tests.map(({ questionCount, ...t }) => t))
}

export function localDeleteTest(testId) {
  const bundle = getLocalTestsBundle()
  saveTests(bundle.tests.filter((t) => t.id !== testId).map(({ questionCount, ...t }) => t))
  saveQuestions(bundle.questions.filter((q) => q.testId !== testId))
  saveAttempts(bundle.attempts.filter((a) => a.testId !== testId))
}

export function localPublishTest(testId) {
  localUpdateTest(testId, { status: 'published' })
}

export function localUnpublishTest(testId) {
  localUpdateTest(testId, { status: 'draft' })
}

export function localCreateQuestion(testId, data) {
  const bundle = getLocalTestsBundle()
  const existing = bundle.questions.filter((q) => q.testId === testId)
  const question = rowToQuestion({
    id: genId(),
    testId,
    ...data,
    sortOrder: data.sortOrder ?? existing.length,
  })
  bundle.questions.push(question)
  saveQuestions(bundle.questions)
  return question.id
}

export function localUpdateQuestion(questionId, updates) {
  const bundle = getLocalTestsBundle()
  const idx = bundle.questions.findIndex((q) => q.id === questionId)
  if (idx < 0) throw new Error('Вопрос не найден')
  bundle.questions[idx] = rowToQuestion({ ...bundle.questions[idx], ...updates })
  saveQuestions(bundle.questions)
}

export function localDeleteQuestion(questionId) {
  const bundle = getLocalTestsBundle()
  saveQuestions(bundle.questions.filter((q) => q.id !== questionId))
}

export function localReorderQuestions(testId, orderedIds) {
  const bundle = getLocalTestsBundle()
  orderedIds.forEach((id, index) => {
    const q = bundle.questions.find((item) => item.id === id)
    if (q) q.sortOrder = index
  })
  saveQuestions(bundle.questions)
}

export function localSubmitAttempt(payload, test, questions) {
  const bundle = getLocalTestsBundle()
  const attempts = bundle.attempts.filter(
    (a) => a.userId === payload.userId && a.testId === payload.testId
  )

  if (test.maxAttempts && attempts.length >= test.maxAttempts) {
    throw new Error('Исчерпано максимальное количество попыток')
  }

  let correctCount = 0
  questions.forEach((q) => {
    if (payload.answers[q.id] === q.correctOptionIndex) correctCount++
  })

  const totalQuestions = questions.length
  const scorePercent =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0
  const passed = scorePercent >= test.passingScore

  const attempt = rowToAttempt({
    id: genId(),
    testId: payload.testId,
    userId: payload.userId,
    courseId: payload.courseId ?? null,
    type: payload.type,
    answers: payload.answers,
    scorePercent,
    correctCount,
    totalQuestions,
    passed,
    submittedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  })

  bundle.attempts.push(attempt)
  saveAttempts(bundle.attempts)

  return {
    ...attempt,
    scorePercent,
    correctCount,
    totalQuestions,
    passed,
  }
}

export { STORAGE_KEYS as TEST_STORAGE_KEYS }

export async function createTest(data) {
  return localCreateTest(data)
}

export async function updateTest(testId, updates) {
  localUpdateTest(testId, updates)
}

export async function deleteTest(testId) {
  localDeleteTest(testId)
}

export async function publishTest(testId) {
  localPublishTest(testId)
}

export async function unpublishTest(testId) {
  localUnpublishTest(testId)
}

export async function createTestQuestion(testId, data) {
  return localCreateQuestion(testId, data)
}

export async function updateTestQuestion(questionId, updates) {
  localUpdateQuestion(questionId, updates)
}

export async function deleteTestQuestion(questionId) {
  localDeleteQuestion(questionId)
}

export async function reorderTestQuestions(testId, orderedIds) {
  localReorderQuestions(testId, orderedIds)
}
