import { TESTS } from '../../../data/tests'
import { getAllCourses } from '../../../utils/adminData'
import '../admin-shared.css'

/** Раздел «Тесты» */
export default function TestsSection() {
  const courses = getAllCourses()

  function getCourseTitle(courseId) {
    return courses.find((c) => c.id === courseId)?.title || `Курс #${courseId}`
  }

  return (
    <>
      <div className="admin-toolbar">
        <span className="admin-toolbar__info">{TESTS.length} тестов</span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Название теста</th>
              <th>Курс</th>
              <th>Вопросов</th>
              <th>Проходной балл</th>
            </tr>
          </thead>
          <tbody>
            {TESTS.map((test) => (
              <tr key={test.id}>
                <td><strong>{test.title}</strong></td>
                <td>{getCourseTitle(test.courseId)}</td>
                <td>{test.questions.length}</td>
                <td>{test.passingScore}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
