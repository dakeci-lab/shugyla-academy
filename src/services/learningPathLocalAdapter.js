import { ROLE_IDS } from '../data/roles'
import { getAllCoursesLocal } from '../utils/adminData'
import { getAllEmployeesLocal, updateEmployee } from '../utils/employeeData'

const STORAGE_KEYS = {
  PATHS: 'shugyla_learning_paths',
  PATH_COURSES: 'shugyla_learning_path_courses',
  USER_PATHS: 'shugyla_user_learning_paths',
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

function rowToPath(row) {
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    role: row.role,
    status: row.status || 'draft',
    courseCount: 0,
  }
}

function rowToPathCourse(row) {
  return {
    id: row.id,
    learningPathId: row.learningPathId ?? row.learning_path_id,
    courseId: Number(row.courseId ?? row.course_id),
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    required: row.required !== false,
  }
}

function rowToUserPath(row) {
  return {
    id: row.id,
    userId: row.userId ?? row.user_id,
    learningPathId: row.learningPathId ?? row.learning_path_id,
    assignedAt: row.assignedAt ?? row.assigned_at ?? new Date().toISOString(),
    assignedBy: row.assignedBy ?? row.assigned_by ?? null,
    status: row.status || 'active',
  }
}

function attachCounts(paths, pathCourses) {
  return paths.map((p) => ({
    ...p,
    courseCount: pathCourses.filter((pc) => pc.learningPathId === p.id).length,
  }))
}

export function seedMockPathsIfEmpty() {
  const existing = readJson(STORAGE_KEYS.PATHS, [])
  if (existing.length > 0) return

  const pathId = genId()
  const paths = [
    {
      id: pathId,
      title: 'Новый кассир',
      description: 'Базовый маршрут для новых кассиров Shugyla Market.',
      role: ROLE_IDS.CASHIER,
      status: 'published',
    },
  ]

  const courseIds = [6, 1, 3]
  const pathCourses = courseIds.map((courseId, index) => ({
    id: genId(),
    learning_path_id: pathId,
    course_id: courseId,
    sort_order: index,
    required: true,
  }))

  writeJson(STORAGE_KEYS.PATHS, paths)
  writeJson(STORAGE_KEYS.PATH_COURSES, pathCourses)
  writeJson(STORAGE_KEYS.USER_PATHS, [])
}

export function getLocalPathsBundle() {
  seedMockPathsIfEmpty()
  const paths = readJson(STORAGE_KEYS.PATHS, []).map(rowToPath)
  const pathCourses = readJson(STORAGE_KEYS.PATH_COURSES, []).map(rowToPathCourse)
  const userPaths = readJson(STORAGE_KEYS.USER_PATHS, []).map(rowToUserPath)
  return {
    paths: attachCounts(paths, pathCourses),
    pathCourses,
    userPaths,
  }
}

function savePaths(paths) {
  writeJson(STORAGE_KEYS.PATHS, paths.map(({ courseCount, ...p }) => p))
}

function savePathCourses(items) {
  writeJson(
    STORAGE_KEYS.PATH_COURSES,
    items.map((pc) => ({
      id: pc.id,
      learning_path_id: pc.learningPathId,
      course_id: pc.courseId,
      sort_order: pc.sortOrder,
      required: pc.required,
    }))
  )
}

function saveUserPaths(items) {
  writeJson(
    STORAGE_KEYS.USER_PATHS,
    items.map((up) => ({
      id: up.id,
      user_id: up.userId,
      learning_path_id: up.learningPathId,
      assigned_at: up.assignedAt,
      assigned_by: up.assignedBy,
      status: up.status,
    }))
  )
}

export async function createLearningPath(data) {
  const bundle = getLocalPathsBundle()
  const path = rowToPath({
    id: genId(),
    ...data,
    status: data.status || 'draft',
  })
  bundle.paths.push(path)
  savePaths(bundle.paths)
  return path.id
}

export async function updateLearningPath(pathId, updates) {
  const bundle = getLocalPathsBundle()
  const idx = bundle.paths.findIndex((p) => p.id === pathId)
  if (idx < 0) throw new Error('Маршрут не найден')
  bundle.paths[idx] = rowToPath({ ...bundle.paths[idx], ...updates })
  savePaths(bundle.paths)
}

export async function deleteLearningPath(pathId) {
  const bundle = getLocalPathsBundle()
  savePaths(bundle.paths.filter((p) => p.id !== pathId))
  savePathCourses(bundle.pathCourses.filter((pc) => pc.learningPathId !== pathId))
  saveUserPaths(bundle.userPaths.filter((up) => up.learningPathId !== pathId))
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
  const bundle = getLocalPathsBundle()
  if (bundle.pathCourses.some((pc) => pc.learningPathId === pathId && pc.courseId === Number(courseId))) {
    throw new Error('Этот курс уже добавлен в маршрут')
  }
  const existing = bundle.pathCourses.filter((pc) => pc.learningPathId === pathId)
  const item = rowToPathCourse({
    id: genId(),
    learningPathId: pathId,
    courseId: Number(courseId),
    sortOrder: options.sortOrder ?? existing.length,
    required: options.required !== false,
  })
  bundle.pathCourses.push(item)
  savePathCourses(bundle.pathCourses)
  return item.id
}

export async function removeCourseFromLearningPath(pathId, courseId) {
  const bundle = getLocalPathsBundle()
  savePathCourses(
    bundle.pathCourses.filter(
      (pc) => !(pc.learningPathId === pathId && pc.courseId === Number(courseId))
    )
  )
}

export async function reorderLearningPathCourses(pathId, orderedCourseIds) {
  const bundle = getLocalPathsBundle()
  orderedCourseIds.forEach((courseId, index) => {
    const pc = bundle.pathCourses.find(
      (item) => item.learningPathId === pathId && item.courseId === Number(courseId)
    )
    if (pc) pc.sortOrder = index
  })
  savePathCourses(bundle.pathCourses)
}

export async function updateLearningPathCourse(pathCourseId, updates) {
  const bundle = getLocalPathsBundle()
  const idx = bundle.pathCourses.findIndex((pc) => pc.id === pathCourseId)
  if (idx < 0) throw new Error('Запись курса не найдена')
  bundle.pathCourses[idx] = rowToPathCourse({ ...bundle.pathCourses[idx], ...updates })
  savePathCourses(bundle.pathCourses)
}

function buildAssignResult(userId, pathId, assignedBy) {
  const bundle = getLocalPathsBundle()
  const path = bundle.paths.find((p) => p.id === pathId)
  if (!path) throw new Error('Маршрут не найден')
  if (path.status === 'archived') throw new Error('Нельзя назначить архивный маршрут')
  if (path.status !== 'published') throw new Error('Можно назначить только опубликованный маршрут')

  const pathCourses = bundle.pathCourses
    .filter((pc) => pc.learningPathId === pathId)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const allCourses = getAllCoursesLocal()
  const employee = getAllEmployeesLocal().find((e) => e.id === userId)
  if (!employee) throw new Error('Сотрудник не найден')

  const currentIds = new Set(employee.assignedCourseIds || [])
  let assignedCount = 0
  let alreadyAssigned = 0
  const skipped = []

  pathCourses.forEach((pc) => {
    const course = allCourses.find((c) => c.id === pc.courseId)
    if (!course) {
      skipped.push({ courseId: pc.courseId, title: '—', reason: 'Курс не найден' })
      return
    }
    if (course.status !== 'published') {
      skipped.push({ courseId: pc.courseId, title: course.title, reason: 'Курс не опубликован' })
      return
    }
    if (currentIds.has(pc.courseId)) {
      alreadyAssigned++
      return
    }
    currentIds.add(pc.courseId)
    assignedCount++
  })

  bundle.userPaths.forEach((up) => {
    if (up.userId === userId && up.status === 'active') up.status = 'cancelled'
  })

  bundle.userPaths.push(
    rowToUserPath({
      id: genId(),
      userId,
      learningPathId: pathId,
      assignedAt: new Date().toISOString(),
      assignedBy,
      status: 'active',
    })
  )

  saveUserPaths(bundle.userPaths)
  updateEmployee(userId, { assignedCourseIds: [...currentIds] })

  return { assignedCount, alreadyAssigned, skipped, pathTitle: path.title }
}

export async function assignLearningPathToUser(userId, pathId, assignedBy = null) {
  return buildAssignResult(userId, pathId, assignedBy)
}

export async function cancelUserLearningPath(userId, pathId) {
  const bundle = getLocalPathsBundle()
  bundle.userPaths.forEach((up) => {
    if (up.userId === userId && up.learningPathId === pathId && up.status === 'active') {
      up.status = 'cancelled'
    }
  })
  saveUserPaths(bundle.userPaths)
}

export async function completeUserLearningPath(userId, pathId) {
  const bundle = getLocalPathsBundle()
  bundle.userPaths.forEach((up) => {
    if (up.userId === userId && up.learningPathId === pathId && up.status === 'active') {
      up.status = 'completed'
    }
  })
  saveUserPaths(bundle.userPaths)
}
