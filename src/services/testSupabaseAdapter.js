import { supabase } from '../lib/supabaseClient'

function rowToTest(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    type: row.type,
    courseId: row.course_id,
    role: row.role,
    status: row.status,
    passingScore: row.passing_score,
    maxAttempts: row.max_attempts,
    timeLimitMinutes: row.time_limit_minutes,
    questionCount: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToQuestion(row) {
  return {
    id: row.id,
    testId: row.test_id,
    questionText: row.question_text,
    questionType: row.question_type,
    options: row.options || [],
    correctOptionIndex: row.correct_option_index,
    explanation: row.explanation || '',
    points: row.points ?? 1,
    sortOrder: row.sort_order ?? 0,
  }
}

function rowToAttempt(row) {
  return {
    id: row.id,
    testId: row.test_id,
    userId: row.user_id,
    courseId: row.course_id,
    type: row.type,
    answers: row.answers || {},
    scorePercent: row.score_percent,
    correctCount: row.correct_count,
    totalQuestions: row.total_questions,
    passed: row.passed,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
  }
}

function testToRow(test) {
  return {
    id: test.id,
    title: test.title,
    description: test.description || '',
    type: test.type,
    course_id: test.courseId ?? null,
    role: test.role ?? null,
    status: test.status || 'draft',
    passing_score: test.passingScore ?? 80,
    max_attempts: test.maxAttempts ?? null,
    time_limit_minutes: test.timeLimitMinutes ?? null,
  }
}

function questionToRow(q) {
  return {
    id: q.id,
    test_id: q.testId,
    question_text: q.questionText,
    question_type: q.questionType || 'single_choice',
    options: q.options,
    correct_option_index: q.correctOptionIndex,
    explanation: q.explanation || '',
    points: q.points ?? 1,
    sort_order: q.sortOrder ?? 0,
  }
}

function attachCounts(tests, questions) {
  return tests.map((t) => ({
    ...t,
    questionCount: questions.filter((q) => q.testId === t.id).length,
  }))
}

async function throwIfError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  return result.data
}

export async function fetchTestsData() {
  const [testsRes, questionsRes, attemptsRes] = await Promise.all([
    supabase.from('academy_tests').select('*').order('created_at'),
    supabase.from('academy_test_questions').select('*').order('sort_order'),
    supabase.from('academy_test_attempts').select('*').order('created_at', { ascending: false }),
  ])

  const tests = (await throwIfError(testsRes, 'Загрузка тестов')).map(rowToTest)
  const questions = (await throwIfError(questionsRes, 'Загрузка вопросов')).map(rowToQuestion)
  const attempts = (await throwIfError(attemptsRes, 'Загрузка попыток')).map(rowToAttempt)

  return {
    tests: attachCounts(tests, questions),
    questions,
    attempts,
  }
}

export async function createTest(data) {
  const row = testToRow({
    ...data,
    id: data.id || crypto.randomUUID(),
    passingScore: data.passingScore ?? 80,
    status: data.status || 'draft',
  })
  await throwIfError(await supabase.from('academy_tests').insert(row), 'Создание теста')
  return row.id
}

export async function updateTest(testId, updates) {
  const patch = {}
  if (updates.title != null) patch.title = updates.title
  if (updates.description != null) patch.description = updates.description
  if (updates.type != null) patch.type = updates.type
  if (updates.courseId !== undefined) patch.course_id = updates.courseId
  if (updates.role !== undefined) patch.role = updates.role
  if (updates.status != null) patch.status = updates.status
  if (updates.passingScore != null) patch.passing_score = updates.passingScore
  if (updates.maxAttempts !== undefined) patch.max_attempts = updates.maxAttempts
  if (updates.timeLimitMinutes !== undefined) patch.time_limit_minutes = updates.timeLimitMinutes

  if (Object.keys(patch).length) {
    await throwIfError(
      await supabase.from('academy_tests').update(patch).eq('id', testId),
      'Обновление теста'
    )
  }
}

export async function deleteTest(testId) {
  await throwIfError(
    await supabase.from('academy_tests').delete().eq('id', testId),
    'Удаление теста'
  )
}

export async function publishTest(testId) {
  await updateTest(testId, { status: 'published' })
}

export async function unpublishTest(testId) {
  await updateTest(testId, { status: 'draft' })
}

export async function createTestQuestion(testId, data) {
  const row = questionToRow({
    id: crypto.randomUUID(),
    testId,
    ...data,
    sortOrder: data.sortOrder ?? 0,
  })
  await throwIfError(
    await supabase.from('academy_test_questions').insert(row),
    'Создание вопроса'
  )
  return row.id
}

export async function updateTestQuestion(questionId, updates) {
  const patch = {}
  if (updates.questionText != null) patch.question_text = updates.questionText
  if (updates.options != null) patch.options = updates.options
  if (updates.correctOptionIndex != null) patch.correct_option_index = updates.correctOptionIndex
  if (updates.explanation != null) patch.explanation = updates.explanation
  if (updates.points != null) patch.points = updates.points
  if (updates.sortOrder != null) patch.sort_order = updates.sortOrder

  if (Object.keys(patch).length) {
    await throwIfError(
      await supabase.from('academy_test_questions').update(patch).eq('id', questionId),
      'Обновление вопроса'
    )
  }
}

export async function deleteTestQuestion(questionId) {
  await throwIfError(
    await supabase.from('academy_test_questions').delete().eq('id', questionId),
    'Удаление вопроса'
  )
}

export async function reorderTestQuestions(testId, orderedIds) {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('academy_test_questions').update({ sort_order: index }).eq('id', id)
    )
  )
}

export async function insertTestAttempt(row) {
  const data = await throwIfError(
    await supabase.from('academy_test_attempts').insert(row).select('*').single(),
    'Сохранение попытки'
  )
  return rowToAttempt(data)
}

export { rowToTest, rowToQuestion, rowToAttempt, attachCounts }
