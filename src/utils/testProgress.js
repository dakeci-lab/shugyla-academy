import { getCourseProgress } from './storage'
import { getCoursesForEmployee } from './courseAccess'
import { areAllMandatoryLessonsComplete, getCourseLessonCount } from './courseStructure'
import {
  getPublishedCourseTest,
  getPublishedFinalAttestation,
  hasPassedTestSync,
  getBestAttemptSync,
  getUserAttemptsSync,
  getTestByIdSync,
  TEST_TYPE,
} from './testData'
import { getEmployeeById } from './employeeData'
import {
  getUserLearningPathSync,
  getLearningPathByIdSync,
} from './learningPathData'
import { isLearningPathComplete } from './learningPathProgress'

export function getCourseTestForCourse(courseId) {
  return getPublishedCourseTest(courseId)
}

export function hasPassedCourseTest(userId, courseId) {
  const test = getPublishedCourseTest(courseId)
  if (!test) return true
  if (hasPassedTestSync(userId, test.id)) return true
  const progress = getCourseProgress(userId, courseId)
  return Boolean(progress.testPassed)
}

export function isCourseFullyComplete(userId, courseId, completedLessons) {
  if (!areAllMandatoryLessonsComplete(completedLessons, courseId)) return false
  return hasPassedCourseTest(userId, courseId)
}

export function getDetailedCourseStatus(userId, courseId, completedLessons) {
  const lessonsDone = areAllMandatoryLessonsComplete(completedLessons, courseId)
  const courseTest = getPublishedCourseTest(courseId)
  const testPassed = hasPassedCourseTest(userId, courseId)

  if (!completedLessons.length) {
    return { label: 'Не начат', type: 'idle' }
  }

  if (lessonsDone && (!courseTest || testPassed)) {
    return { label: 'Курс завершён', type: 'done' }
  }

  if (lessonsDone && courseTest && !testPassed) {
    return { label: 'Тест не сдан', type: 'warning' }
  }

  if (lessonsDone) {
    return { label: 'Уроки пройдены', type: 'progress' }
  }

  return { label: 'В процессе', type: 'progress' }
}

export function getCourseTestStatus(userId, courseId) {
  const test = getPublishedCourseTest(courseId)
  if (!test) return { label: '—', type: 'idle' }
  if (hasPassedCourseTest(userId, courseId)) {
    return { label: 'Сдан', type: 'done' }
  }
  const best = getBestAttemptSync(userId, test.id)
  if (best) return { label: 'Не сдан', type: 'failed' }
  return { label: 'Не начат', type: 'idle' }
}

function resolveEmployee(userOrId) {
  if (typeof userOrId === 'object') return userOrId
  return getEmployeeById(userOrId)
}

export function areAllAssignedCoursesComplete(userId) {
  const employee = resolveEmployee(userId)
  const courses = getCoursesForEmployee(employee)

  if (!courses.length) return false

  return courses.every((course) => {
    const progress = getCourseProgress(employee.id, course.id)
    return isCourseFullyComplete(employee.id, course.id, progress.completedLessons)
  })
}

export function getFinalAttestationAvailability(userId, role) {
  const attestation = getPublishedFinalAttestation(role)
  if (!attestation) {
    return {
      available: false,
      reason: 'Для роли не создана аттестация',
      test: null,
    }
  }

  const pathAssignment = getUserLearningPathSync(userId)
  if (pathAssignment) {
    const path = getLearningPathByIdSync(pathAssignment.learningPathId)
    if (path && path.status !== 'archived') {
      if (!isLearningPathComplete(userId, pathAssignment.learningPathId)) {
        return {
          available: false,
          reason: 'Маршрут обучения ещё не завершён',
          test: attestation,
        }
      }
      return { available: true, reason: null, test: attestation }
    }
  }

  if (!areAllAssignedCoursesComplete(userId)) {
    return {
      available: false,
      reason: 'Назначенные курсы ещё не завершены',
      test: attestation,
    }
  }

  return { available: true, reason: null, test: attestation }
}

export function getFinalAttestationStatus(userId, role) {
  const attestation = getPublishedFinalAttestation(role)
  if (!attestation) {
    return { status: 'not_available', label: 'Не доступна', type: 'idle', reason: 'Нет аттестации для роли' }
  }

  const availability = getFinalAttestationAvailability(userId, role)
  if (!availability.available) {
    return {
      status: 'not_available',
      label: 'Не доступна',
      type: 'idle',
      reason: availability.reason,
      test: attestation,
    }
  }

  if (hasPassedTestSync(userId, attestation.id)) {
    return {
      status: 'passed',
      label: 'Сдана',
      type: 'done',
      test: attestation,
      best: getBestAttemptSync(userId, attestation.id),
    }
  }

  const attempts = getUserAttemptsSync(userId, attestation.id)
  if (attempts.length > 0) {
    return {
      status: 'failed',
      label: 'Не сдана',
      type: 'failed',
      test: attestation,
      best: getBestAttemptSync(userId, attestation.id),
    }
  }

  return {
    status: 'available',
    label: 'Доступна',
    type: 'progress',
    test: attestation,
  }
}

export const ATTESTATION_ADMIN_LABELS = {
  not_available: 'Не доступна',
  available: 'Доступна',
  not_started: 'Не начата',
  in_progress: 'В процессе',
  passed: 'Сдана',
  failed: 'Не сдана',
}

export function getAdminFinalAttestationStatus(userId, role) {
  const attestation = getPublishedFinalAttestation(role)
  if (!attestation) {
    return {
      status: 'not_available',
      label: ATTESTATION_ADMIN_LABELS.not_available,
      type: 'idle',
      reason: 'Нет опубликованной аттестации',
      best: null,
      lastAttemptAt: null,
    }
  }

  const availability = getFinalAttestationAvailability(userId, role)
  if (!availability.available) {
    return {
      status: 'not_available',
      label: ATTESTATION_ADMIN_LABELS.not_available,
      type: 'idle',
      reason: availability.reason,
      best: null,
      lastAttemptAt: null,
      test: attestation,
    }
  }

  const attempts = getUserAttemptsSync(userId, attestation.id)
  const best = getBestAttemptSync(userId, attestation.id)

  if (best?.passed) {
    return {
      status: 'passed',
      label: ATTESTATION_ADMIN_LABELS.passed,
      type: 'done',
      best,
      lastAttemptAt: attempts[0]?.submittedAt || null,
      test: attestation,
    }
  }

  if (attempts.length > 0) {
    return {
      status: 'failed',
      label: ATTESTATION_ADMIN_LABELS.failed,
      type: 'failed',
      best,
      lastAttemptAt: attempts[0]?.submittedAt || null,
      test: attestation,
    }
  }

  const courses = getCoursesForEmployee(resolveEmployee(userId))
  const anyProgress = courses.some((c) => {
    const p = getCourseProgress(userId, c.id)
    return p.completedLessons.length > 0
  })

  return {
    status: anyProgress ? 'available' : 'not_started',
    label: anyProgress ? ATTESTATION_ADMIN_LABELS.available : ATTESTATION_ADMIN_LABELS.not_started,
    type: anyProgress ? 'progress' : 'idle',
    best: null,
    lastAttemptAt: null,
    test: attestation,
  }
}

export function getEmployeeOverallAttestationLabel(userId, role) {
  return getAdminFinalAttestationStatus(userId, role).label
}

export { TEST_TYPE }
