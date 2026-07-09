import { useMemo, useState } from 'react'
import {
  getVacancies,
  getCandidates,
  getAllCandidateQuestions,
  getVacancyById,
  getCandidateById,
  getCandidateQuestions,
  createVacancy,
  updateVacancy,
  publishVacancy,
  unpublishVacancy,
  archiveVacancy,
  deleteVacancy,
  updateCandidateNotes,
  updateCandidateStatus,
  rejectCandidate,
  inviteCandidate,
  convertCandidateToTrainee,
  hireCandidateAsUser,
} from '../../../services/academyDataService'
import { getAssignableCourses } from '../../../utils/courseAccess'
import {
  VACANCY_STATUS,
  VACANCY_STATUS_LABELS,
  VACANCY_ROLES,
  getVacancyRoleLabel,
  getApplyUrl,
  CANDIDATE_STATUS_LABELS,
  CANDIDATE_STATUS_BADGE,
  getCandidateAnswerBreakdown,
  matchesScoreFilter,
  SCORE_FILTER_OPTIONS,
} from '../../../utils/recruitmentData'
import { EMPLOYMENT_STATUS } from '../../../utils/employeeData'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../AdminModal'
import StatusBadge from '../StatusBadge'
import VacancyQuestionEditor from '../VacancyQuestionEditor'
import CandidateAvatar from '../../CandidateAvatar'
import '../../CandidateAvatar.css'
import '../admin-shared.css'
import '../../../pages/Apply.css'

const TABS = [
  { id: 'vacancies', label: 'Вакансии' },
  { id: 'candidates', label: 'Кандидаты' },
  { id: 'questions', label: 'Вопросы' },
]

const STATUS_BADGE = {
  draft: 'warning',
  published: 'done',
  archived: 'idle',
}

const EMPTY_VACANCY = {
  title: '',
  description: '',
  role: 'cashier',
  passingScore: 80,
  status: 'draft',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

function copyApplyLink(slug) {
  const url = getApplyUrl(slug)
  navigator.clipboard?.writeText(url).catch(() => {})
  return url
}

/** Раздел «Найм» */
export default function RecruitmentSection() {
  const { version, refresh } = useAdminRefresh()
  const [tab, setTab] = useState('vacancies')
  const [showVacancyForm, setShowVacancyForm] = useState(false)
  const [editVacancyId, setEditVacancyId] = useState(null)
  const [vacancyForm, setVacancyForm] = useState(EMPTY_VACANCY)
  const [vacancyError, setVacancyError] = useState('')
  const [actionError, setActionError] = useState('')
  const [copiedSlug, setCopiedSlug] = useState('')

  const [candidateFilters, setCandidateFilters] = useState({
    vacancyId: 'all',
    status: 'all',
    score: 'all',
    search: '',
  })
  const [detailCandidateId, setDetailCandidateId] = useState(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [showHireForm, setShowHireForm] = useState(false)
  const [hireForm, setHireForm] = useState({
    login: '',
    password: '',
    position: '',
    employmentStatus: EMPLOYMENT_STATUS.INTERNSHIP,
    initialCourseId: '',
  })
  const [hireError, setHireError] = useState('')

  void version

  const vacancies = getVacancies()
  const candidates = getCandidates()
  const allQuestions = getAllCandidateQuestions()

  const filteredCandidates = useMemo(() => {
    const q = candidateFilters.search.trim().toLowerCase()
    return candidates.filter((c) => {
      if (candidateFilters.vacancyId !== 'all' && c.vacancyId !== candidateFilters.vacancyId) {
        return false
      }
      if (candidateFilters.status !== 'all' && c.status !== candidateFilters.status) return false
      if (!matchesScoreFilter(c, candidateFilters.score)) return false
      if (q) {
        const hay = `${c.fullName} ${c.phone}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [candidates, candidateFilters])

  const detailCandidate = detailCandidateId ? getCandidateById(detailCandidateId) : null
  const detailVacancy = detailCandidate?.vacancyId
    ? getVacancyById(detailCandidate.vacancyId)
    : null
  const detailQuestions = detailCandidate?.vacancyId
    ? getCandidateQuestions(detailCandidate.vacancyId)
    : []
  const answerBreakdown = detailCandidate
    ? getCandidateAnswerBreakdown(detailCandidate, detailQuestions)
    : []

  function openCreateVacancy() {
    setEditVacancyId(null)
    setVacancyForm(EMPTY_VACANCY)
    setVacancyError('')
    setShowVacancyForm(true)
  }

  function openEditVacancy(vacancy) {
    setEditVacancyId(vacancy.id)
    setVacancyForm({
      title: vacancy.title,
      description: vacancy.description || '',
      role: vacancy.role,
      passingScore: vacancy.passingScore,
      status: vacancy.status,
    })
    setVacancyError('')
    setShowVacancyForm(true)
  }

  async function handleVacancySave(e) {
    e.preventDefault()
    if (!vacancyForm.title.trim()) {
      setVacancyError('Укажите название вакансии')
      return
    }
    try {
      const payload = {
        title: vacancyForm.title.trim(),
        description: vacancyForm.description.trim(),
        role: vacancyForm.role,
        passingScore: Number(vacancyForm.passingScore) || 80,
        status: vacancyForm.status,
      }
      if (editVacancyId) {
        await updateVacancy(editVacancyId, payload)
      } else {
        const id = await createVacancy(payload)
        setEditVacancyId(id)
      }
      setVacancyError('')
      await refresh()
    } catch (err) {
      setVacancyError(err.message || 'Не удалось сохранить вакансию')
    }
  }

  async function runVacancyAction(action, vacancyId) {
    setActionError('')
    try {
      await action(vacancyId)
      await refresh()
    } catch (err) {
      setActionError(err.message || 'Не удалось выполнить действие')
    }
  }

  function openCandidateDetail(candidate) {
    setDetailCandidateId(candidate.id)
    setNotesDraft(candidate.adminNotes || '')
    setShowHireForm(false)
  }

  async function saveNotes() {
    if (!detailCandidateId) return
    await updateCandidateNotes(detailCandidateId, notesDraft)
    await refresh()
  }

  async function setStatus(status) {
    if (!detailCandidateId) return
    await updateCandidateStatus(detailCandidateId, status)
    await refresh()
  }

  function openHireModal() {
    if (!detailCandidate) return
    const role = detailVacancy?.role || 'cashier'
    setHireForm({
      login: '',
      password: '',
      position: getVacancyRoleLabel(role),
      employmentStatus: EMPLOYMENT_STATUS.INTERNSHIP,
      initialCourseId: '',
    })
    setHireError('')
    setShowHireForm(true)
  }

  async function handleHire(e) {
    e.preventDefault()
    if (!detailCandidateId || !detailCandidate) return
    if (!hireForm.login.trim() || !hireForm.password.trim()) {
      setHireError('Укажите логин и пароль')
      return
    }
    try {
      await hireCandidateAsUser(
        detailCandidateId,
        {
          firstName: detailCandidate.firstName,
          lastName: detailCandidate.lastName,
          login: hireForm.login.trim(),
          password: hireForm.password,
          position: hireForm.position.trim(),
          role: detailVacancy?.role || 'cashier',
          employmentStatus: hireForm.employmentStatus,
          initialCourseId: hireForm.initialCourseId ? Number(hireForm.initialCourseId) : null,
        },
        { asTrainee: hireForm.employmentStatus === EMPLOYMENT_STATUS.INTERNSHIP }
      )
      setShowHireForm(false)
      setDetailCandidateId(null)
      await refresh()
    } catch (err) {
      setHireError(err.message || 'Не удалось создать сотрудника')
    }
  }

  const hireCourses = detailVacancy
    ? getAssignableCourses().filter(
        (course) =>
          course.allowedRoles?.includes(detailVacancy.role) ||
          course.allowedRoles?.includes('for_all') ||
          course.allowedRoles?.includes('candidate')
      )
    : []

  return (
    <>
      <div className="admin-filter-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`admin-filter-tab ${tab === item.id ? 'admin-filter-tab--active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {actionError && <p className="admin-form__error">{actionError}</p>}

      {tab === 'vacancies' && (
        <>
          <div className="admin-toolbar">
            <span className="admin-toolbar__info">{vacancies.length} вакансий</span>
            <button type="button" className="btn btn--primary btn--sm" onClick={openCreateVacancy}>
              + Создать вакансию
            </button>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Проходной %</th>
                  <th>Вопросов</th>
                  <th>Кандидатов</th>
                  <th>Ссылка</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vacancies.length === 0 ? (
                  <tr><td colSpan={8} className="admin-empty">Вакансии не созданы</td></tr>
                ) : (
                  vacancies.map((v) => (
                    <tr key={v.id}>
                      <td><strong>{v.title}</strong></td>
                      <td>{getVacancyRoleLabel(v.role)}</td>
                      <td>
                        <StatusBadge label={VACANCY_STATUS_LABELS[v.status]} type={STATUS_BADGE[v.status]} />
                      </td>
                      <td>{v.passingScore}%</td>
                      <td>{v.questionCount ?? 0}</td>
                      <td>{v.candidateCount ?? 0}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          onClick={() => {
                            copyApplyLink(v.slug)
                            setCopiedSlug(v.slug)
                            setTimeout(() => setCopiedSlug(''), 2000)
                          }}
                        >
                          {copiedSlug === v.slug ? 'Скопировано' : 'Скопировать ссылку'}
                        </button>
                        <div className="admin-table__hint">/apply/{v.slug}</div>
                      </td>
                      <td>
                        <div className="admin-table__actions">
                          <button type="button" className="btn btn--outline btn--sm" onClick={() => openEditVacancy(v)}>
                            Редактировать
                          </button>
                          {v.status === VACANCY_STATUS.DRAFT && (
                            <button type="button" className="btn btn--outline btn--sm" onClick={() => runVacancyAction(publishVacancy, v.id)}>
                              Опубликовать
                            </button>
                          )}
                          {v.status === VACANCY_STATUS.PUBLISHED && (
                            <button type="button" className="btn btn--outline btn--sm" onClick={() => runVacancyAction(unpublishVacancy, v.id)}>
                              Снять с публикации
                            </button>
                          )}
                          {v.status !== VACANCY_STATUS.ARCHIVED && (
                            <button type="button" className="btn btn--outline btn--sm" onClick={() => runVacancyAction(archiveVacancy, v.id)}>
                              Архивировать
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn--outline btn--sm admin-table__danger"
                            onClick={async () => {
                              if (!window.confirm(`Удалить вакансию «${v.title}»?`)) return
                              await runVacancyAction(deleteVacancy, v.id)
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'candidates' && (
        <>
          <div className="admin-toolbar admin-toolbar--stack">
            <input
              type="search"
              className="admin-search"
              placeholder="Поиск по ФИО или телефону…"
              value={candidateFilters.search}
              onChange={(e) => setCandidateFilters({ ...candidateFilters, search: e.target.value })}
            />
            <select
              className="admin-form__select"
              value={candidateFilters.vacancyId}
              onChange={(e) => setCandidateFilters({ ...candidateFilters, vacancyId: e.target.value })}
            >
              <option value="all">Все вакансии</option>
              {vacancies.map((v) => (
                <option key={v.id} value={v.id}>{v.title}</option>
              ))}
            </select>
            <select
              className="admin-form__select"
              value={candidateFilters.status}
              onChange={(e) => setCandidateFilters({ ...candidateFilters, status: e.target.value })}
            >
              <option value="all">Все статусы</option>
              {Object.entries(CANDIDATE_STATUS_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
            <select
              className="admin-form__select"
              value={candidateFilters.score}
              onChange={(e) => setCandidateFilters({ ...candidateFilters, score: e.target.value })}
            >
              {SCORE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th></th>
                  <th>ФИО</th>
                  <th>Телефон</th>
                  <th>Вакансия</th>
                  <th>Возраст</th>
                  <th>Опыт</th>
                  <th>Результат</th>
                  <th>Статус</th>
                  <th>Дата</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.length === 0 ? (
                  <tr><td colSpan={10} className="admin-empty">Кандидаты не найдены</td></tr>
                ) : (
                  filteredCandidates.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <CandidateAvatar fullName={c.fullName} photoUrl={c.photoUrl} size="sm" />
                      </td>
                      <td>
                        <div className="candidate-table-cell">
                          <strong>{c.fullName}</strong>
                        </div>
                      </td>
                      <td>{c.phone}</td>
                      <td>{getVacancyById(c.vacancyId)?.title || '—'}</td>
                      <td>{c.age ?? '—'}</td>
                      <td>{c.experience || '—'}</td>
                      <td>{c.scorePercent}%</td>
                      <td>
                        <StatusBadge
                          label={CANDIDATE_STATUS_LABELS[c.status]}
                          type={CANDIDATE_STATUS_BADGE[c.status]}
                        />
                      </td>
                      <td>{formatDate(c.submittedAt)}</td>
                      <td>
                        <div className="admin-table__actions">
                          <button type="button" className="btn btn--outline btn--sm" onClick={() => openCandidateDetail(c)}>
                            Подробнее
                          </button>
                          <button type="button" className="btn btn--outline btn--sm" onClick={async () => { await inviteCandidate(c.id); await refresh() }}>
                            Пригласить
                          </button>
                          <button type="button" className="btn btn--outline btn--sm admin-table__danger" onClick={async () => { await rejectCandidate(c.id); await refresh() }}>
                            Отклонить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'questions' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Вакансия</th>
                <th>Вопрос</th>
                <th>Вариантов</th>
                <th>Обязательный</th>
              </tr>
            </thead>
            <tbody>
              {allQuestions.length === 0 ? (
                <tr><td colSpan={4} className="admin-empty">Вопросы не добавлены</td></tr>
              ) : (
                allQuestions.map((q) => (
                  <tr key={q.id}>
                    <td>{getVacancyById(q.vacancyId)?.title || '—'}</td>
                    <td>{q.questionText}</td>
                    <td>{q.options.length}</td>
                    <td>{q.required ? 'Да' : 'Нет'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showVacancyForm && (
        <AdminModal
          title={editVacancyId ? 'Редактировать вакансию' : 'Создать вакансию'}
          onClose={() => setShowVacancyForm(false)}
          xwide
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={() => setShowVacancyForm(false)}>Закрыть</button>
              <button type="submit" className="btn btn--primary" form="vacancy-form">Сохранить</button>
            </>
          }
        >
          <form id="vacancy-form" className="admin-form" onSubmit={handleVacancySave}>
            <label className="admin-form__label">
              Название вакансии *
              <input className="admin-form__input" value={vacancyForm.title} onChange={(e) => setVacancyForm({ ...vacancyForm, title: e.target.value })} required />
            </label>
            <label className="admin-form__label">
              Описание
              <textarea className="admin-form__input" rows={3} value={vacancyForm.description} onChange={(e) => setVacancyForm({ ...vacancyForm, description: e.target.value })} />
            </label>
            <div className="admin-form__row">
              <label className="admin-form__label">
                Роль / должность
                <select className="admin-form__select" value={vacancyForm.role} onChange={(e) => setVacancyForm({ ...vacancyForm, role: e.target.value })}>
                  {VACANCY_ROLES.map((roleId) => (
                    <option key={roleId} value={roleId}>{getVacancyRoleLabel(roleId)}</option>
                  ))}
                </select>
              </label>
              <label className="admin-form__label">
                Проходной балл %
                <input className="admin-form__input" type="number" min={0} max={100} value={vacancyForm.passingScore} onChange={(e) => setVacancyForm({ ...vacancyForm, passingScore: e.target.value })} />
              </label>
              <label className="admin-form__label">
                Статус
                <select className="admin-form__select" value={vacancyForm.status} onChange={(e) => setVacancyForm({ ...vacancyForm, status: e.target.value })}>
                  <option value="draft">Черновик</option>
                  <option value="published">Опубликовано</option>
                  <option value="archived">Архив</option>
                </select>
              </label>
            </div>
            {vacancyError && <p className="admin-form__error">{vacancyError}</p>}
          </form>
          {editVacancyId && <VacancyQuestionEditor vacancyId={editVacancyId} />}
        </AdminModal>
      )}

      {detailCandidate && (
        <AdminModal
          title={`Кандидат: ${detailCandidate.fullName}`}
          onClose={() => { setDetailCandidateId(null); setShowHireForm(false) }}
          xwide
        >
          <div className="apply-detail-grid">
            <div>
              {detailCandidate.photoUrl && (
                <div className="candidate-detail-photo">
                  <a href={detailCandidate.photoUrl} target="_blank" rel="noopener noreferrer" title="Открыть фото">
                    <CandidateAvatar
                      fullName={detailCandidate.fullName}
                      photoUrl={detailCandidate.photoUrl}
                      size="lg"
                      className="candidate-avatar--clickable"
                    />
                  </a>
                  <p className="admin-form__hint">Нажмите на фото, чтобы открыть в новой вкладке</p>
                </div>
              )}
              {!detailCandidate.photoUrl && (
                <div className="candidate-detail-photo">
                  <CandidateAvatar fullName={detailCandidate.fullName} size="lg" />
                </div>
              )}
              <p><strong>Телефон:</strong> {detailCandidate.phone}</p>
              <p><strong>Вакансия:</strong> {detailVacancy?.title || '—'}</p>
              <p><strong>Возраст:</strong> {detailCandidate.age ?? '—'}</p>
              <p><strong>Город:</strong> {detailCandidate.city || '—'}</p>
              <p><strong>Опыт:</strong> {detailCandidate.experience || '—'}</p>
              <p><strong>Ранее работал:</strong> {detailCandidate.previousWork || '—'}</p>
              <p><strong>Зарплата:</strong> {detailCandidate.expectedSalary || '—'}</p>
              <p><strong>Готов выйти:</strong> {detailCandidate.availableFrom || '—'}</p>
              <p><strong>О себе:</strong> {detailCandidate.about || '—'}</p>
            </div>
            <div>
              <p><strong>Результат:</strong> {detailCandidate.scorePercent}% ({detailCandidate.totalScore}/{detailCandidate.maxScore})</p>
              <StatusBadge label={CANDIDATE_STATUS_LABELS[detailCandidate.status]} type={CANDIDATE_STATUS_BADGE[detailCandidate.status]} />
              <p className="admin-form__hint">Дата заявки: {formatDate(detailCandidate.submittedAt)}</p>
            </div>
          </div>

          <h3 className="admin-detail-heading">Ответы на вопросы</h3>
          <ul className="admin-detail-list">
            {answerBreakdown.map((row) => (
              <li key={row.questionId}>
                <strong>{row.questionText}</strong>
                <span>{row.selectedOption} — {row.score}/{row.maxScore} б.</span>
              </li>
            ))}
          </ul>

          <label className="admin-form__label">
            Заметки админа
            <textarea className="admin-form__input" rows={3} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
          </label>
          <button type="button" className="btn btn--outline btn--sm" onClick={saveNotes}>Сохранить заметку</button>

          <div className="admin-table__actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn--outline btn--sm" onClick={async () => { await inviteCandidate(detailCandidate.id); await refresh() }}>Пригласить на собеседование</button>
            <button type="button" className="btn btn--outline btn--sm admin-table__danger" onClick={async () => { await rejectCandidate(detailCandidate.id); await refresh() }}>Отклонить</button>
            <button type="button" className="btn btn--outline btn--sm" onClick={async () => { await setStatus('interview_passed'); await refresh() }}>Собеседование пройдено</button>
            <button type="button" className="btn btn--outline btn--sm" onClick={async () => { await convertCandidateToTrainee(detailCandidate.id); await refresh() }}>Перевести в стажёры</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={openHireModal}>Создать сотрудника</button>
          </div>

          {showHireForm && (
            <form className="admin-form apply-hire-form" onSubmit={handleHire}>
              <h3 className="admin-detail-heading">Создание сотрудника</h3>
              <p className="admin-form__hint">
                Имя: {detailCandidate.firstName} {detailCandidate.lastName}. Роль: {getVacancyRoleLabel(detailVacancy?.role)}.
                {detailCandidate.photoUrl
                  ? ' Фото кандидата будет перенесено в avatar_url сотрудника.'
                  : ' Телефон и фото не сохраняются в academy_users (phone отсутствует в схеме).'}
              </p>
              <div className="admin-form__row">
                <label className="admin-form__label">
                  Логин *
                  <input className="admin-form__input" value={hireForm.login} onChange={(e) => setHireForm({ ...hireForm, login: e.target.value })} required />
                </label>
                <label className="admin-form__label">
                  Пароль *
                  <input className="admin-form__input" type="password" value={hireForm.password} onChange={(e) => setHireForm({ ...hireForm, password: e.target.value })} required />
                </label>
              </div>
              <label className="admin-form__label">
                Должность
                <input className="admin-form__input" value={hireForm.position} onChange={(e) => setHireForm({ ...hireForm, position: e.target.value })} />
              </label>
              <div className="admin-form__row">
                <label className="admin-form__label">
                  Статус сотрудника
                  <select className="admin-form__select" value={hireForm.employmentStatus} onChange={(e) => setHireForm({ ...hireForm, employmentStatus: e.target.value })}>
                    <option value={EMPLOYMENT_STATUS.INTERNSHIP}>Стажировка</option>
                    <option value={EMPLOYMENT_STATUS.ACTIVE}>Активен</option>
                  </select>
                </label>
                <label className="admin-form__label">
                  Начальный курс
                  <select
                    className="admin-form__select"
                    value={hireForm.initialCourseId}
                    onChange={(e) => setHireForm({ ...hireForm, initialCourseId: e.target.value })}
                  >
                    <option value="">Без назначения</option>
                    {hireCourses.map((course) => (
                      <option key={course.id} value={course.id}>{course.title}</option>
                    ))}
                  </select>
                </label>
              </div>
              {hireError && <p className="admin-form__error">{hireError}</p>}
              <button type="submit" className="btn btn--primary btn--sm">Создать сотрудника</button>
            </form>
          )}
        </AdminModal>
      )}
    </>
  )
}
