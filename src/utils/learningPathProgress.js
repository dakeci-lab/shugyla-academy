import { getCourseProgress } from './storage'
import { getAllCourses } from './adminData'
import {
  getLearningPathCoursesSync,
  getLearningPathByIdSync,
  getUserLearningPathSync,
  PATH_STATUS,
} from './learningPathData'
import { isCourseFullyComplete } from './testProgress'

export function getPathCourseDetails(pathId) {
  const pathCourses = getLearningPathCoursesSync(pathId)
  const allCourses = getAllCourses()

  return pathCourses.map((pc) => {
    const course = allCourses.find((c) => c.id === pc.courseId)
    return {
      ...pc,
      course: course
        ? { id: course.id, title: course.title, status: course.status }
        : { id: pc.courseId, title: 'Курс удалён', status: 'missing' },
    }
  })
}

export function getLearningPathProgress(userId, pathId) {
  const path = getLearningPathByIdSync(pathId)
  if (!path) {
    return {
      path: null,
      totalCourses: 0,
      requiredCourses: 0,
      completedCourses: 0,
      percent: 0,
      status: { label: 'Маршрут не найден', type: 'idle' },
      courses: [],
    }
  }

  const items = getPathCourseDetails(pathId)
  const requiredItems = items.filter((item) => item.required)

  let completed = 0
  const courseRows = items.map((item) => {
    const progress = getCourseProgress(userId, item.courseId)
    const done = item.course.status === 'published'
      ? isCourseFullyComplete(userId, item.courseId, progress.completedLessons)
      : false
    if (item.required && done) completed++

    let courseStatus = { label: 'Не начат', type: 'idle' }
    if (item.course.status === 'missing') {
      courseStatus = { label: 'Недоступен', type: 'failed' }
    } else if (item.course.status !== 'published') {
      courseStatus = { label: 'Черновик', type: 'warning' }
    } else if (done) {
      courseStatus = { label: 'Завершён', type: 'done' }
    } else if (progress.completedLessons.length > 0) {
      courseStatus = { label: 'В процессе', type: 'progress' }
    }

    return {
      ...item,
      progress,
      completed: done,
      courseStatus,
    }
  })

  const requiredTotal = requiredItems.length
  const percent = requiredTotal > 0 ? Math.round((completed / requiredTotal) * 100) : 0

  let status
  if (completed === 0) {
    status = { label: 'Не начат', type: 'idle' }
  } else if (requiredTotal > 0 && completed >= requiredTotal) {
    status = { label: 'Завершён', type: 'done' }
  } else {
    status = { label: 'В процессе', type: 'progress' }
  }

  return {
    path,
    totalCourses: items.length,
    requiredCourses: requiredTotal,
    completedCourses: completed,
    percent,
    status,
    courses: courseRows,
  }
}

export function getUserActivePathProgress(userId) {
  const assignment = getUserLearningPathSync(userId)
  if (!assignment) return null

  const path = getLearningPathByIdSync(assignment.learningPathId)
  const progress = getLearningPathProgress(userId, assignment.learningPathId)

  return {
    assignment,
    path,
    isArchived: path?.status === PATH_STATUS.ARCHIVED,
    ...progress,
  }
}

export function isLearningPathComplete(userId, pathId) {
  const { requiredCourses, completedCourses } = getLearningPathProgress(userId, pathId)
  return requiredCourses > 0 && completedCourses >= requiredCourses
}

export function hasActiveLearningPath(userId) {
  return Boolean(getUserLearningPathSync(userId))
}
