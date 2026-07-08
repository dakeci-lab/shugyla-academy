import { isCloudMode } from '../lib/dataMode'
import {
  getCloudLearningPaths,
  getCloudLearningPathCourses,
  getCloudUserLearningPaths,
} from '../lib/cloudStore'
import { getLocalPathsBundle } from '../services/learningPathLocalAdapter'

export const PATH_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
}

export const PATH_STATUS_LABELS = {
  draft: 'Черновик',
  published: 'Опубликован',
  archived: 'Архив',
}

export const USER_PATH_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

export function normalizeLearningPath(raw) {
  return {
    id: raw.id,
    title: raw.title || '',
    description: raw.description || '',
    role: raw.role,
    status: raw.status || PATH_STATUS.DRAFT,
    courseCount: raw.courseCount ?? 0,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  }
}

export function normalizePathCourse(raw) {
  return {
    id: raw.id,
    learningPathId: raw.learningPathId ?? raw.learning_path_id,
    courseId: Number(raw.courseId ?? raw.course_id),
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
    required: raw.required !== false,
    createdAt: raw.createdAt ?? raw.created_at,
  }
}

export function normalizeUserPath(raw) {
  return {
    id: raw.id,
    userId: raw.userId ?? raw.user_id,
    learningPathId: raw.learningPathId ?? raw.learning_path_id,
    assignedAt: raw.assignedAt ?? raw.assigned_at,
    assignedBy: raw.assignedBy ?? raw.assigned_by ?? null,
    status: raw.status || USER_PATH_STATUS.ACTIVE,
  }
}

function attachCourseCounts(paths, pathCourses) {
  return paths.map((p) => ({
    ...p,
    courseCount: pathCourses.filter((pc) => pc.learningPathId === p.id).length,
  }))
}

function readBundle() {
  if (isCloudMode()) {
    const paths = getCloudLearningPaths()
    const pathCourses = getCloudLearningPathCourses()
    const userPaths = getCloudUserLearningPaths()
    if (paths) {
      return {
        paths: attachCourseCounts(paths, pathCourses || []),
        pathCourses: pathCourses || [],
        userPaths: userPaths || [],
      }
    }
    return { paths: [], pathCourses: [], userPaths: [] }
  }
  return getLocalPathsBundle()
}

export function getAllLearningPathsSync() {
  return readBundle().paths
}

export function getAllPathCoursesSync() {
  return readBundle().pathCourses
}

export function getAllUserPathsSync() {
  return readBundle().userPaths
}

export function getLearningPathByIdSync(pathId) {
  return getAllLearningPathsSync().find((p) => p.id === pathId) || null
}

export function getLearningPathsByRoleSync(role, { publishedOnly = false } = {}) {
  return getAllLearningPathsSync().filter((p) => {
    if (p.role !== role) return false
    if (publishedOnly && p.status !== PATH_STATUS.PUBLISHED) return false
    return true
  })
}

export function getLearningPathCoursesSync(pathId) {
  return getAllPathCoursesSync()
    .filter((pc) => pc.learningPathId === pathId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getUserLearningPathSync(userId) {
  const active = getAllUserPathsSync()
    .filter((up) => up.userId === userId && up.status === USER_PATH_STATUS.ACTIVE)
    .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt))
  return active[0] || null
}

export function getUserLearningPathsSync(userId) {
  return getAllUserPathsSync()
    .filter((up) => up.userId === userId)
    .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt))
}

export function getActiveLearningPathForUser(userId) {
  const assignment = getUserLearningPathSync(userId)
  if (!assignment) return null
  const path = getLearningPathByIdSync(assignment.learningPathId)
  if (!path) return { assignment, path: null, label: 'Маршрут удалён' }
  if (path.status === PATH_STATUS.ARCHIVED) {
    return { assignment, path, label: 'Архивный маршрут', isArchived: true }
  }
  return { assignment, path, label: path.title, isArchived: false }
}
