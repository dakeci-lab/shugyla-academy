import {
  getAllEmployeesLocal,
  addEmployee as localAddEmployee,
  updateEmployee as localUpdateEmployee,
  deactivateEmployee as localDeactivateEmployee,
  authenticateEmployee as localAuthenticateEmployee,
} from '../utils/employeeData'
import {
  getAllCoursesLocal,
  addCourse as localAddCourse,
  updateCourse as localUpdateCourse,
} from '../utils/adminData'
import {
  getLessonsForCourseLocal,
  addLesson as localAddLesson,
  updateLesson as localUpdateLesson,
  deleteLesson as localDeleteLesson,
} from '../utils/lessonData'
import {
  getProgress as localGetProgress,
  getCourseProgress as localGetCourseProgress,
  markLessonComplete as localMarkLessonComplete,
  saveTestResult as localSaveTestResult,
} from '../utils/storage'
import { normalizeEmployee } from '../utils/employeeData'
import { normalizeLesson } from '../utils/lessonData'
import { courseToRow, lessonToRow, parseDurationHours } from './supabaseDataAdapter'

/** Collect all data from localStorage for migration */
export function collectLocalSnapshot() {
  const employees = getAllEmployeesLocal()
  const courses = getAllCoursesLocal()

  const lessons = []
  courses.forEach((course) => {
    getLessonsForCourseLocal(course.id).forEach((lesson) => {
      lessons.push(lesson)
    })
  })

  const assignments = []
  employees.forEach((emp) => {
    ;(emp.assignedCourseIds || []).forEach((courseId) => {
      assignments.push({ user_id: emp.id, course_id: courseId })
    })
  })

  const progressRaw = localGetProgress()
  const progressRows = []

  Object.entries(progressRaw).forEach(([userId, coursesMap]) => {
    Object.entries(coursesMap).forEach(([courseId, entry]) => {
      ;(entry.completedLessons || []).forEach((lessonId) => {
        progressRows.push({
          user_id: Number(userId),
          course_id: Number(courseId),
          lesson_id: lessonId,
          completed: true,
          completed_at: new Date().toISOString(),
        })
      })

      if (entry.testPassed != null || entry.testScore != null) {
        progressRows.push({
          user_id: Number(userId),
          course_id: Number(courseId),
          lesson_id: null,
          completed: Boolean(entry.testPassed),
          test_passed: entry.testPassed,
          test_score: entry.testScore,
        })
      }
    })
  })

  const users = employees.map((emp) => ({
    id: emp.id,
    first_name: emp.firstName,
    last_name: emp.lastName,
    full_name: emp.name,
    login: emp.login,
    password: emp.password || '',
    role: emp.role,
    position: emp.position || '',
    status: emp.employmentStatus || 'active',
  }))

  const courseRows = courses.map((course) =>
    courseToRow({
      ...course,
      allowedRoles: course.allowedRoles,
    })
  )

  const lessonRows = lessons.map((lesson) => lessonToRow(lesson))

  return {
    counts: {
      employees: employees.length,
      courses: courses.length,
      lessons: lessons.length,
      progress: progressRows.length,
    },
    users,
    courses: courseRows,
    lessons: lessonRows,
    assignments,
    progressRows,
  }
}

export async function getEmployees() {
  return getAllEmployeesLocal()
}

export async function createEmployee(data) {
  return localAddEmployee(data)
}

export async function updateEmployee(id, updates) {
  localUpdateEmployee(id, updates)
}

export async function deactivateEmployee(id) {
  localDeactivateEmployee(id)
}

export async function getCourses() {
  return getAllCoursesLocal()
}

export async function createCourse(course) {
  return localAddCourse(course)
}

export async function updateCourse(courseId, updates) {
  localUpdateCourse(courseId, updates)
}

export async function hideCourse(courseId) {
  localUpdateCourse(courseId, { status: 'draft' })
}

export async function getCourseLessons(courseId) {
  return getLessonsForCourseLocal(courseId)
}

export async function createLesson(courseId, lessonData) {
  return localAddLesson(courseId, lessonData)
}

export async function updateLesson(lessonId, updates) {
  localUpdateLesson(lessonId, updates)
}

export async function deleteLesson(lessonId) {
  localDeleteLesson(lessonId)
}

export async function assignCourse(userId, courseId) {
  const emp = getAllEmployeesLocal().find((e) => e.id === userId)
  if (!emp) return
  const ids = new Set(emp.assignedCourseIds || [])
  ids.add(courseId)
  localUpdateEmployee(userId, { assignedCourseIds: [...ids] })
}

export async function getUserProgress(userId) {
  return localGetProgress()[userId] || {}
}

export async function markLessonComplete(userId, courseId, lessonId) {
  localMarkLessonComplete(userId, courseId, lessonId)
}

export async function saveTestResult(userId, courseId, score, passed) {
  localSaveTestResult(userId, courseId, score, passed)
}

export async function authenticateUser(loginValue, password) {
  return localAuthenticateEmployee(loginValue, password)
}

export async function initializeLocal() {
  return {
    employees: getAllEmployeesLocal(),
    courses: getAllCoursesLocal(),
    lessons: [],
    assignments: [],
    progress: localGetProgress(),
  }
}

export function getCourseProgressSync(userId, courseId) {
  return localGetCourseProgress(userId, courseId)
}

export { normalizeEmployee, normalizeLesson, parseDurationHours }
