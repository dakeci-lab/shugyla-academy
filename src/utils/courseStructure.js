import { BLOCKS } from '../data/blocks'
import { LESSONS } from '../data/lessons'
import { TESTS } from '../data/tests'

/** Все уроки курса, отсортированные по блокам */
export function getCourseLessons(courseId) {
  return LESSONS.filter((l) => l.courseId === courseId).sort((a, b) => {
    const blockA = BLOCKS.find((bl) => bl.id === a.blockId)?.order ?? 0
    const blockB = BLOCKS.find((bl) => bl.id === b.blockId)?.order ?? 0
    if (blockA !== blockB) return blockA - blockB
    return a.order - b.order
  })
}

/** Структура курса: блоки с вложенными уроками */
export function getCourseStructure(courseId) {
  const blocks = BLOCKS.filter((b) => b.courseId === courseId).sort(
    (a, b) => a.order - b.order
  )

  return blocks.map((block) => ({
    ...block,
    lessons: LESSONS.filter((l) => l.blockId === block.id).sort(
      (a, b) => a.order - b.order
    ),
  }))
}

/** Итоговый тест курса */
export function getCourseTest(courseId) {
  return TESTS.find((t) => t.courseId === courseId) || null
}

/** Количество уроков в курсе (из структуры данных) */
export function getCourseLessonCount(courseId) {
  return getCourseLessons(courseId).length
}

/** Процент прогресса по пройденным урокам */
export function calcLessonProgress(completedLessons, courseId) {
  const total = getCourseLessonCount(courseId)
  if (total === 0) return 0
  const completed = completedLessons.filter((id) =>
    LESSONS.some((l) => l.id === id && l.courseId === courseId)
  ).length
  return Math.round((completed / total) * 100)
}

/** Все уроки пройдены */
export function areAllLessonsComplete(completedLessons, courseId) {
  const lessons = getCourseLessons(courseId)
  return lessons.length > 0 && lessons.every((l) => completedLessons.includes(l.id))
}
