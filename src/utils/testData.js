import { isCloudMode } from '../lib/dataMode'
import {
  getCloudTests,
  getCloudTestQuestions,
  getCloudTestAttempts,
} from '../lib/cloudStore'
import { getLocalTestsBundle } from '../services/testLocalAdapter'

export const TEST_TYPE = {
  COURSE: 'course_test',
  FINAL: 'final_attestation',
}

export const TEST_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
}

export const TEST_TYPE_LABELS = {
  course_test: 'Тест курса',
  final_attestation: 'Финальная аттестация',
}

export const TEST_STATUS_LABELS = {
  draft: 'Черновик',
  published: 'Опубликован',
}

export function normalizeTest(raw) {
  return {
    id: raw.id,
    title: raw.title || '',
    description: raw.description || '',
    type: raw.type,
    courseId: raw.courseId ?? raw.course_id ?? null,
    role: raw.role ?? null,
    status: raw.status || TEST_STATUS.DRAFT,
    passingScore: raw.passingScore ?? raw.passing_score ?? 80,
    maxAttempts: raw.maxAttempts ?? raw.max_attempts ?? null,
    timeLimitMinutes: raw.timeLimitMinutes ?? raw.time_limit_minutes ?? null,
    questionCount: raw.questionCount ?? 0,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  }
}

export function normalizeQuestion(raw) {
  return {
    id: raw.id,
    testId: raw.testId ?? raw.test_id,
    questionText: raw.questionText ?? raw.question_text ?? '',
    questionType: raw.questionType ?? raw.question_type ?? 'single_choice',
    options: Array.isArray(raw.options) ? raw.options : [],
    correctOptionIndex: raw.correctOptionIndex ?? raw.correct_option_index ?? 0,
    explanation: raw.explanation || '',
    points: raw.points ?? 1,
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
  }
}

export function normalizeAttempt(raw) {
  return {
    id: raw.id,
    testId: raw.testId ?? raw.test_id,
    userId: raw.userId ?? raw.user_id,
    courseId: raw.courseId ?? raw.course_id ?? null,
    type: raw.type,
    answers: raw.answers || {},
    scorePercent: raw.scorePercent ?? raw.score_percent ?? 0,
    correctCount: raw.correctCount ?? raw.correct_count ?? 0,
    totalQuestions: raw.totalQuestions ?? raw.total_questions ?? 0,
    passed: Boolean(raw.passed),
    startedAt: raw.startedAt ?? raw.started_at,
    submittedAt: raw.submittedAt ?? raw.submitted_at,
    createdAt: raw.createdAt ?? raw.created_at,
  }
}

/** Convert test + questions to legacy CourseTest shape */
export function testToLegacyFormat(test, questions) {
  const sorted = [...questions].sort((a, b) => a.sortOrder - b.sortOrder)
  return {
    id: test.id,
    courseId: test.courseId,
    title: test.title,
    description: test.description,
    passingScore: test.passingScore,
    maxAttempts: test.maxAttempts,
    type: test.type,
    questions: sorted.map((q) => ({
      id: q.id,
      text: q.questionText,
      options: q.options,
      correct: q.correctOptionIndex,
      explanation: q.explanation,
      points: q.points,
    })),
  }
}

function attachQuestionCounts(tests, questions) {
  return tests.map((test) => ({
    ...test,
    questionCount: questions.filter((q) => q.testId === test.id).length,
  }))
}

function readLocalTestsBundle() {
  if (isCloudMode()) {
    const tests = getCloudTests()
    const questions = getCloudTestQuestions()
    const attempts = getCloudTestAttempts()
    if (tests) {
      return {
        tests: attachQuestionCounts(tests, questions || []),
        questions: questions || [],
        attempts: attempts || [],
      }
    }
    return { tests: [], questions: [], attempts: [] }
  }

  return getLocalTestsBundle()
}

export function getAllTestsSync() {
  return readLocalTestsBundle().tests
}

export function getAllQuestionsSync() {
  return readLocalTestsBundle().questions
}

export function getAllAttemptsSync() {
  return readLocalTestsBundle().attempts
}

export function getTestByIdSync(testId) {
  return getAllTestsSync().find((t) => t.id === testId) || null
}

export function getTestQuestionsSync(testId) {
  return getAllQuestionsSync()
    .filter((q) => q.testId === testId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getPublishedCourseTest(courseId) {
  const test = getAllTestsSync().find(
    (t) =>
      t.type === TEST_TYPE.COURSE &&
      Number(t.courseId) === Number(courseId) &&
      t.status === TEST_STATUS.PUBLISHED
  )
  if (!test) return null
  const questions = getTestQuestionsSync(test.id)
  return testToLegacyFormat(test, questions)
}

export function getPublishedFinalAttestation(role) {
  const test = getAllTestsSync().find(
    (t) =>
      t.type === TEST_TYPE.FINAL &&
      t.role === role &&
      t.status === TEST_STATUS.PUBLISHED
  )
  if (!test) return null
  const questions = getTestQuestionsSync(test.id)
  return testToLegacyFormat(test, questions)
}

export function getUserAttemptsSync(userId, testId = null) {
  let attempts = getAllAttemptsSync().filter((a) => a.userId === userId)
  if (testId) attempts = attempts.filter((a) => a.testId === testId)
  return attempts.sort(
    (a, b) => new Date(b.submittedAt || b.createdAt) - new Date(a.submittedAt || a.createdAt)
  )
}

export function getBestAttemptSync(userId, testId) {
  const attempts = getUserAttemptsSync(userId, testId)
  if (!attempts.length) return null
  return attempts.reduce((best, cur) =>
    cur.scorePercent > (best?.scorePercent ?? -1) ? cur : best
  , null)
}

export function hasPassedTestSync(userId, testId) {
  const best = getBestAttemptSync(userId, testId)
  return Boolean(best?.passed)
}
