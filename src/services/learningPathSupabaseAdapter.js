import { supabase } from '../lib/supabaseClient'
import { getAllCourses } from '../utils/adminData'
import { getEmployeeById } from '../utils/employeeData'

async function throwIfError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  return result.data
}

function rowToPath(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    role: row.role,
    status: row.status,
    courseCount: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToPathCourse(row) {
  return {
    id: row.id,
    learningPathId: row.learning_path_id,
    courseId: Number(row.course_id),
    sortOrder: row.sort_order ?? 0,
    required: row.required !== false,
    createdAt: row.created_at,
  }
}

function rowToUserPath(row) {
  return {
    id: row.id,
    userId: row.user_id,
    learningPathId: row.learning_path_id,
    assignedAt: row.assigned_at,
    assignedBy: row.assigned_by,
    status: row.status,
  }
}

function attachCounts(paths, pathCourses) {
  return paths.map((p) => ({
    ...p,
    courseCount: pathCourses.filter((pc) => pc.learningPathId === p.id).length,
  }))
}

export async function fetchLearningPathsData() {
  const [pathsRes, coursesRes, userPathsRes] = await Promise.all([
    supabase.from('academy_learning_paths').select('*').order('created_at'),
    supabase.from('academy_learning_path_courses').select('*').order('sort_order'),
    supabase.from('academy_user_learning_paths').select('*').order('assigned_at', { ascending: false }),
  ])

  const paths = (await throwIfError(pathsRes, 'Загрузка маршрутов')).map(rowToPath)
  const pathCourses = (await throwIfError(coursesRes, 'Загрузка курсов маршрутов')).map(rowToPathCourse)
  const userPaths = (await throwIfError(userPathsRes, 'Загрузка назначений маршрутов')).map(rowToUserPath)

  return {
    paths: attachCounts(paths, pathCourses),
    pathCourses,
    userPaths,
  }
}

export async function createLearningPath(data) {
  const row = {
    id: data.id || crypto.randomUUID(),
    title: data.title,
    description: data.description || '',
    role: data.role,
    status: data.status || 'draft',
  }
  await throwIfError(await supabase.from('academy_learning_paths').insert(row), 'Создание маршрута')
  return row.id
}

export async function updateLearningPath(pathId, updates) {
  const patch = {}
  if (updates.title != null) patch.title = updates.title
  if (updates.description != null) patch.description = updates.description
  if (updates.role != null) patch.role = updates.role
  if (updates.status != null) patch.status = updates.status
  if (Object.keys(patch).length) {
    await throwIfError(
      await supabase.from('academy_learning_paths').update(patch).eq('id', pathId),
      'Обновление маршрута'
    )
  }
}

export async function deleteLearningPath(pathId) {
  await throwIfError(
    await supabase.from('academy_learning_paths').delete().eq('id', pathId),
    'Удаление маршрута'
  )
}

export async function publishLearningPath(pathId) {
  await updateLearningPath(pathId, { status: 'published' })
}

export async function unpublishLearningPath(pathId) {
  await updateLearningPath(pathId, { status: 'draft' })
}

export async function archiveLearningPath(pathId) {
  await updateLearningPath(pathId, { status: 'archived' })
}

export async function addCourseToLearningPath(pathId, courseId, options = {}) {
  const dupRes = await supabase
    .from('academy_learning_path_courses')
    .select('id')
    .eq('learning_path_id', pathId)
    .eq('course_id', Number(courseId))
    .maybeSingle()
  if (dupRes.data) throw new Error('Этот курс уже добавлен в маршрут')

  const countRes = await supabase
    .from('academy_learning_path_courses')
    .select('sort_order')
    .eq('learning_path_id', pathId)
  const existing = await throwIfError(countRes, 'Подсчёт курсов маршрута')

  const row = {
    id: crypto.randomUUID(),
    learning_path_id: pathId,
    course_id: Number(courseId),
    sort_order: options.sortOrder ?? existing.length,
    required: options.required !== false,
  }

  await throwIfError(
    await supabase.from('academy_learning_path_courses').insert(row),
    'Добавление курса в маршрут'
  )
  return row.id
}

export async function removeCourseFromLearningPath(pathId, courseId) {
  await throwIfError(
    await supabase
      .from('academy_learning_path_courses')
      .delete()
      .eq('learning_path_id', pathId)
      .eq('course_id', Number(courseId)),
    'Удаление курса из маршрута'
  )
}

export async function reorderLearningPathCourses(pathId, orderedCourseIds) {
  await Promise.all(
    orderedCourseIds.map((courseId, index) =>
      supabase
        .from('academy_learning_path_courses')
        .update({ sort_order: index })
        .eq('learning_path_id', pathId)
        .eq('course_id', Number(courseId))
    )
  )
}

export async function updateLearningPathCourse(pathCourseId, updates) {
  const patch = {}
  if (updates.sortOrder != null) patch.sort_order = updates.sortOrder
  if (updates.required != null) patch.required = updates.required
  if (Object.keys(patch).length) {
    await throwIfError(
      await supabase.from('academy_learning_path_courses').update(patch).eq('id', pathCourseId),
      'Обновление курса маршрута'
    )
  }
}

async function syncAssignments(userId, courseIds) {
  await throwIfError(
    await supabase.from('academy_course_assignments').delete().eq('user_id', userId),
    'Очистка назначений'
  )
  if (!courseIds.length) return
  const rows = courseIds.map((courseId) => ({ user_id: userId, course_id: courseId }))
  await throwIfError(
    await supabase.from('academy_course_assignments').insert(rows),
    'Назначение курсов'
  )
}

export async function assignLearningPathToUser(userId, pathId, assignedBy = null, pathData, pathCoursesData) {
  const path = pathData || (await throwIfError(
    await supabase.from('academy_learning_paths').select('*').eq('id', pathId).maybeSingle(),
    'Загрузка маршрута'
  ))

  if (!path) throw new Error('Маршрут не найден')
  if (path.status === 'archived') throw new Error('Нельзя назначить архивный маршрут')
  if (path.status !== 'published') throw new Error('Можно назначить только опубликованный маршрут')

  let pathCourses = pathCoursesData
  if (!pathCourses) {
    pathCourses = await throwIfError(
      await supabase
        .from('academy_learning_path_courses')
        .select('*')
        .eq('learning_path_id', pathId)
        .order('sort_order'),
      'Курсы маршрута'
    )
  }

  const allCourses = getAllCourses()
  const employee = getEmployeeById(userId)
  if (!employee) throw new Error('Сотрудник не найден')

  const currentIds = new Set(employee.assignedCourseIds || [])
  let assignedCount = 0
  let alreadyAssigned = 0
  const skipped = []

  pathCourses.forEach((pc) => {
    const courseId = Number(pc.course_id ?? pc.courseId)
    const course = allCourses.find((c) => c.id === courseId)
    if (!course) {
      skipped.push({ courseId, title: '—', reason: 'Курс не найден' })
      return
    }
    if (course.status !== 'published') {
      skipped.push({ courseId, title: course.title, reason: 'Курс не опубликован' })
      return
    }
    if (currentIds.has(courseId)) {
      alreadyAssigned++
      return
    }
    currentIds.add(courseId)
    assignedCount++
  })

  await throwIfError(
    await supabase
      .from('academy_user_learning_paths')
      .update({ status: 'cancelled' })
      .eq('user_id', userId)
      .eq('status', 'active'),
    'Отмена предыдущего маршрута'
  )

  await throwIfError(
    await supabase.from('academy_user_learning_paths').insert({
      user_id: userId,
      learning_path_id: pathId,
      assigned_by: assignedBy,
      status: 'active',
    }),
    'Назначение маршрута'
  )

  await syncAssignments(userId, [...currentIds])

  return { assignedCount, alreadyAssigned, skipped, pathTitle: path.title }
}

export async function cancelUserLearningPath(userId, pathId) {
  await throwIfError(
    await supabase
      .from('academy_user_learning_paths')
      .update({ status: 'cancelled' })
      .eq('user_id', userId)
      .eq('learning_path_id', pathId)
      .eq('status', 'active'),
    'Отмена маршрута'
  )
}

export async function completeUserLearningPath(userId, pathId) {
  await throwIfError(
    await supabase
      .from('academy_user_learning_paths')
      .update({ status: 'completed' })
      .eq('user_id', userId)
      .eq('learning_path_id', pathId)
      .eq('status', 'active'),
    'Завершение маршрута'
  )
}
