import { BLOCKS } from '../data/blocks'
import { getLessonsForCourse } from './lessonData'
import { getPublishedCourseTest } from './testData'

/** Все уроки курса */
export function getCourseLessons(courseId) {
  return getLessonsForCourse(courseId)
}

/** Структура курса: блоки с уроками (если есть blockId) */
export function getCourseStructure(courseId) {
  const lessons = getCourseLessons(courseId)
  const blocks = BLOCKS.filter((b) => b.courseId === courseId).sort(
    (a, b) => a.order - b.order
  )

  if (blocks.length === 0) {
    if (lessons.length === 0) return []
    return [{ id: `flat-${courseId}`, courseId, title: 'Уроки курса', order: 1, lessons }]
  }

  const usedBlockIds = new Set(lessons.map((l) => l.blockId).filter(Boolean))
  const result = blocks
    .filter((b) => usedBlockIds.has(b.id))
    .map((block) => ({
      ...block,
      lessons: lessons.filter((l) => l.blockId === block.id),
    }))

  const unassigned = lessons.filter((l) => !l.blockId || !blocks.some((b) => b.id === l.blockId))
  if (unassigned.length > 0) {
    result.push({
      id: `other-${courseId}`,
      courseId,
      title: 'Дополнительные уроки',
      order: 999,
      lessons: unassigned,
    })
  }

  return result
}

export function getCourseTest(courseId) {
  return getPublishedCourseTest(courseId)
}

export function getCourseLessonCount(courseId) {
  return getCourseLessons(courseId).length
}

export function calcLessonProgress(completedLessons, courseId) {
  const lessons = getCourseLessons(courseId)
  if (lessons.length === 0) return 0
  const completed = lessons.filter((l) => completedLessons.includes(l.id)).length
  return Math.round((completed / lessons.length) * 100)
}

export function areAllLessonsComplete(completedLessons, courseId) {
  return areAllMandatoryLessonsComplete(completedLessons, courseId)
}

export function areAllMandatoryLessonsComplete(completedLessons, courseId) {
  const lessons = getCourseLessons(courseId)
  if (lessons.length === 0) return false
  const mandatory = lessons.filter((l) => l.mandatory)
  const target = mandatory.length > 0 ? mandatory : lessons
  return target.every((l) => completedLessons.includes(l.id))
}

/** Статус прохождения курса */
export function getCourseCompletionStatus(completedLessons, courseId) {
  const percent = calcLessonProgress(completedLessons, courseId)
  if (percent === 0) return { label: 'Не начат', type: 'idle' }
  if (percent === 100) return { label: 'Завершён', type: 'done' }
  return { label: 'В процессе', type: 'progress' }
}
