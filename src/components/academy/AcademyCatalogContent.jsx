import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPublishedCourses } from '../../utils/courseAccess'
import { useSession } from '../../context/SessionContext'
import { useLanguage } from '../../context/LanguageContext'
import { useAcademyData } from '../../context/AcademyDataContext'
import { isCloudMode } from '../../lib/dataMode'
import { isModuleReady, isModuleLoading, getModuleError } from '../../lib/cloudStore'
import { normalizeRoleId } from '../../data/roles'
import CategoryFilter from '../CategoryFilter'
import CourseCard from '../CourseCard'
import '../../pages/Academy.css'

/** Каталог курсов — только активные курсы */
export default function AcademyCatalogContent() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const { t } = useLanguage()
  const { user } = useSession()
  const { ensureModules, version } = useAcademyData()

  useEffect(() => {
    if (!isCloudMode()) return
    void ensureModules(['courses', 'academyLearning'])
  }, [ensureModules])

  void version
  const coursesLoading =
    isCloudMode() && (isModuleLoading('courses') || !isModuleReady('courses'))
  const coursesError = isCloudMode() ? getModuleError('courses') : null
  const courses = coursesLoading || coursesError ? [] : getPublishedCourses()
  const userRole = normalizeRoleId(user?.role)

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      if (activeCategory !== 'all' && course.category !== activeCategory) return false

      if (roleFilter !== 'all') {
        return course.allowedRoles?.includes(roleFilter)
      }

      if (userRole) {
        return (
          course.allowedRoles?.includes(userRole) ||
          course.allowedRoles?.includes('for_all')
        )
      }

      return true
    })
  }, [courses, activeCategory, roleFilter, userRole])

  return (
    <div className="academy-page academy-page--embedded">
      <div className="academy-page__catalog">
        <div className="academy-page__catalog-top">
          <Link to="/platform/academy" className="btn btn--ghost btn--sm">
            ← Academy
          </Link>
        </div>

        <div className="academy-page__intro">
          <div>
            <h2 className="academy-page__heading">{t.coursesHeading}</h2>
            <p className="academy-page__subheading">{t.coursesSubheading}</p>
          </div>
          <span className="academy-page__count">
            {filteredCourses.length} {t.coursesCount}
          </span>
        </div>

        <CategoryFilter active={activeCategory} onChange={setActiveCategory} />

        <div className="academy-page__filters">
          <label className="academy-page__filter-label">
            Роль:
            <select
              className="admin-form__select admin-form__select--sm"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">Моя роль</option>
              <option value="cashier">Кассир</option>
              <option value="seller">Продавец</option>
              <option value="floor_admin">Администратор</option>
              <option value="receiver">Приёмщик</option>
              <option value="purchaser">Закупщик</option>
              <option value="for_all">Для всех</option>
            </select>
          </label>
        </div>

        <div className="academy-page__grid">
          {filteredCourses.map((course) => (
            <CourseCard key={course.id} course={course} courseBasePath="/platform/courses" />
          ))}
        </div>

        {coursesError && (
          <p className="academy-page__empty">Не удалось загрузить курсы. Попробуйте обновить страницу.</p>
        )}
        {!coursesError && coursesLoading && (
          <p className="academy-page__empty">Загрузка курсов…</p>
        )}
        {!coursesError && !coursesLoading && filteredCourses.length === 0 && (
          <p className="academy-page__empty">{t.emptyCourses}</p>
        )}
      </div>
    </div>
  )
}
