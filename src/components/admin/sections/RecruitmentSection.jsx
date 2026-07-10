import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getVacancies,
  getCandidates,
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
  saveCandidateInterviewInvitation,
  convertCandidateToTrainee,
} from '../../../services/academyDataService'
import {
  VACANCY_STATUS,
  VACANCY_STATUS_LABELS,
  VACANCY_ROLES,
  getVacancyRoleLabel,
  getApplyUrl,
  CANDIDATE_STATUS,
  CANDIDATE_STATUS_LABELS,
  CANDIDATE_STATUS_BADGE,
  getCandidateAnswerBreakdown,
  matchesScoreFilter,
  SCORE_FILTER_OPTIONS,
  CANDIDATE_STATUS_FILTER_OPTIONS,
  canCreateEmployeeForCandidate,
  isCandidateEmployeeCreated,
  hasInterviewInvitation,
  buildInterviewInvitationFromCandidate,
  formatInterviewDateLabel,
  formatInterviewTimeLabel,
} from '../../../utils/recruitmentData'
import { EMPLOYEE_FORM_ROLES, ROLES } from '../../../data/roles'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../AdminModal'
import StatusBadge from '../StatusBadge'
import VacancyQuestionEditor from '../VacancyQuestionEditor'
import CandidateAvatar from '../../CandidateAvatar'
import CandidatePhotoPreviewModal from '../../CandidatePhotoPreviewModal'
import CandidateInterviewInviteModal, {
  copyTextToClipboard,
} from '../CandidateInterviewInviteModal'
import '../../CandidateAvatar.css'
import '../admin-shared.css'
import '../RecruitmentSection.css'
import '../../../pages/Apply.css'

const TABS = [
  { id: 'vacancies', label: 'Вакансии' },
  { id: 'candidates', label: 'Кандидаты' },
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
  employeeRole: 'cashier',
  passingScore: 80,
  status: 'draft',
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}.${mm}.${yy}`
}

function copyApplyLink(slug) {
  const url = getApplyUrl(slug)
  navigator.clipboard?.writeText(url).catch(() => {})
  return url
}

/** Раздел «Найм» */
export default function RecruitmentSection() {
  const navigate = useNavigate()
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
  const [previewPhoto, setPreviewPhoto] = useState(null)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  void version

  const vacancies = getVacancies()
  const candidates = getCandidates()

  const filteredCandidates = useMemo(() => {
    const q = candidateFilters.search.trim().toLowerCase()
    return candidates.filter((c) => {
      if (candidateFilters.vacancyId !== 'all' && c.vacancyId !== candidateFilters.vacancyId) {
        return false
      }
      if (candidateFilters.status !== 'all') {
        const status = c.status
        const filterStatus = candidateFilters.status
        if (filterStatus === CANDIDATE_STATUS.QUESTIONABLE) {
          if (status !== 'questionable' && status !== 'maybe') return false
        } else if (status !== filterStatus) {
          return false
        }
      }
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
      employeeRole: vacancy.employeeRole || vacancy.role,
      passingScore: vacancy.passingScore,
      status: vacancy.status,
    })
    setVacancyError('')
    setShowVacancyForm(true)
  }

  function updateVacancyRole(role) {
    setVacancyForm((prev) => ({
      ...prev,
      role,
      employeeRole: prev.employeeRole === prev.role ? role : prev.employeeRole,
    }))
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
        employeeRole: vacancyForm.employeeRole || vacancyForm.role,
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
    setSuccessMessage('')
    setActionError('')
  }

  async function saveNotes() {
    if (!detailCandidateId) return
    await updateCandidateNotes(detailCandidateId, notesDraft)
    await refresh()
  }

  async function runCandidateAction(action) {
    if (!detailCandidateId) return
    setActionError('')
    try {
      await action(detailCandidateId)
      await refresh()
    } catch (err) {
      setActionError(err.message || 'Не удалось выполнить действие')
    }
  }

  function goCreateEmployee(candidate) {
    navigate(`/platform/employees/list?createFromCandidate=${candidate.id}`)
    setDetailCandidateId(null)
  }

  function openInviteModal() {
    setActionError('')
    setInviteModalOpen(true)
  }

  async function handleInterviewInviteSubmit(invitation) {
    if (!detailCandidateId) return
    setInviteSubmitting(true)
    setActionError('')
    try {
      await saveCandidateInterviewInvitation(detailCandidateId, invitation)
      await refresh()
      setInviteModalOpen(false)
      setSuccessMessage('Текст приглашения скопирован. Кандидат отмечен как приглашённый.')
    } catch (err) {
      throw err
    } finally {
      setInviteSubmitting(false)
    }
  }

  async function handleReCopyInvitation() {
    if (!detailCandidate) return
    const text = buildInterviewInvitationFromCandidate(detailCandidate)
    const copied = await copyTextToClipboard(text)
    if (copied) {
      setSuccessMessage('Текст приглашения скопирован.')
    } else {
      setActionError('Не удалось скопировать текст в буфер обмена')
    }
  }

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

      {successMessage && (
        <p className="admin-success-banner" role="status">
          {successMessage}
        </p>
      )}

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
                      <td>{getVacancyRoleLabel(v.employeeRole || v.role)}</td>
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
              {CANDIDATE_STATUS_FILTER_OPTIONS.map((id) => (
                <option key={id} value={id}>{CANDIDATE_STATUS_LABELS[id]}</option>
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

          <div className="admin-table-wrap recruitment-candidates-wrap">
            <table className="admin-table admin-table--compact recruitment-candidates-table">
              <thead>
                <tr>
                  <th className="col-name">ФИО</th>
                  <th className="col-vacancy">Вакансия</th>
                  <th className="col-age">Возраст</th>
                  <th className="col-experience">Опыт</th>
                  <th className="col-score">Результат</th>
                  <th className="col-status">Статус</th>
                  <th className="col-date">Дата</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.length === 0 ? (
                  <tr><td colSpan={7} className="admin-empty">Кандидаты не найдены</td></tr>
                ) : (
                  filteredCandidates.map((c) => (
                    <tr key={c.id}>
                      <td className="col-name">
                        <button
                          type="button"
                          className="candidate-row-link"
                          onClick={() => openCandidateDetail(c)}
                        >
                          <CandidateAvatar fullName={c.fullName} photoUrl={c.photoUrl} size="sm" />
                          <span className="candidate-row-link__name">{c.fullName}</span>
                        </button>
                      </td>
                      <td className="col-vacancy">{getVacancyById(c.vacancyId)?.title || '—'}</td>
                      <td className="col-age">{c.age ?? '—'}</td>
                      <td className="col-experience" title={c.experience || undefined}>
                        {c.experience || '—'}
                      </td>
                      <td className="col-score">{c.scorePercent}%</td>
                      <td className="col-status">
                        <StatusBadge
                          label={CANDIDATE_STATUS_LABELS[c.status]}
                          type={CANDIDATE_STATUS_BADGE[c.status]}
                        />
                      </td>
                      <td className="col-date">{formatDate(c.submittedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
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
                Роль вакансии
                <select className="admin-form__select" value={vacancyForm.role} onChange={(e) => updateVacancyRole(e.target.value)}>
                  {VACANCY_ROLES.map((roleId) => (
                    <option key={roleId} value={roleId}>{getVacancyRoleLabel(roleId)}</option>
                  ))}
                </select>
              </label>
              <label className="admin-form__label">
                Роль сотрудника после найма
                <select
                  className="admin-form__select"
                  value={vacancyForm.employeeRole}
                  onChange={(e) => setVacancyForm({ ...vacancyForm, employeeRole: e.target.value })}
                >
                  {EMPLOYEE_FORM_ROLES.map((roleId) => (
                    <option key={roleId} value={roleId}>
                      {ROLES[roleId]?.label || roleId}
                    </option>
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

          <div className="vacancy-questions-block">
            {editVacancyId ? (
              <VacancyQuestionEditor vacancyId={editVacancyId} />
            ) : (
              <p className="admin-form__hint">
                Сохраните вакансию, чтобы добавить фильтр-вопросы для кандидата.
              </p>
            )}
          </div>
        </AdminModal>
      )}

      {detailCandidate && (
        <AdminModal
          title={`Кандидат: ${detailCandidate.fullName}`}
          onClose={() => {
            setDetailCandidateId(null)
            setPreviewPhoto(null)
            setInviteModalOpen(false)
          }}
          xwide
        >
          <div className="apply-detail-grid">
            <div>
              <div className="candidate-detail-photo">
                {detailCandidate.photoUrl ? (
                  <button
                    type="button"
                    className="candidate-detail-photo-btn"
                    onClick={() => setPreviewPhoto(detailCandidate.photoUrl)}
                    aria-label="Открыть фотографию кандидата"
                  >
                    <CandidateAvatar
                      fullName={detailCandidate.fullName}
                      photoUrl={detailCandidate.photoUrl}
                      size="lg"
                    />
                  </button>
                ) : (
                  <CandidateAvatar
                    fullName={detailCandidate.fullName}
                    size="lg"
                  />
                )}
              </div>
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
              {isCandidateEmployeeCreated(detailCandidate) && (
                <p className="candidate-hire-badge">Сотрудник создан</p>
              )}
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

          {hasInterviewInvitation(detailCandidate) && (
            <div className="candidate-interview-block">
              <h3 className="candidate-interview-block__title">Собеседование</h3>
              <p><strong>Дата:</strong> {formatInterviewDateLabel(detailCandidate.interviewDate)}</p>
              <p><strong>Время:</strong> {formatInterviewTimeLabel(detailCandidate.interviewTime)}</p>
              <p><strong>Адрес:</strong> {detailCandidate.interviewAddress}</p>
              <p><strong>Статус:</strong> {CANDIDATE_STATUS_LABELS[detailCandidate.status]}</p>
              {detailCandidate.interviewComment && (
                <p><strong>Комментарий:</strong> {detailCandidate.interviewComment}</p>
              )}
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handleReCopyInvitation}
              >
                Скопировать приглашение повторно
              </button>
            </div>
          )}

          <div className="candidate-detail-actions">
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={openInviteModal}
            >
              Пригласить на собеседование
            </button>
            <button
              type="button"
              className="btn btn--outline btn--sm admin-table__danger"
              onClick={() => runCandidateAction(rejectCandidate)}
            >
              Отклонить
            </button>
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => runCandidateAction((id) => updateCandidateStatus(id, CANDIDATE_STATUS.INTERVIEW_PASSED))}
            >
              Собеседование пройдено
            </button>
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => runCandidateAction(convertCandidateToTrainee)}
            >
              Перевести в стажёры
            </button>
            {isCandidateEmployeeCreated(detailCandidate) ? (
              <span className="candidate-hire-badge">Сотрудник создан</span>
            ) : canCreateEmployeeForCandidate(detailCandidate) ? (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => goCreateEmployee(detailCandidate)}
              >
                Создать сотрудника
              </button>
            ) : null}
          </div>
        </AdminModal>
      )}

      <CandidatePhotoPreviewModal
        photoUrl={previewPhoto}
        alt={detailCandidate ? `Фотография ${detailCandidate.fullName}` : 'Фотография кандидата'}
        onClose={() => setPreviewPhoto(null)}
      />

      {inviteModalOpen && detailCandidate && (
        <CandidateInterviewInviteModal
          candidate={detailCandidate}
          onClose={() => setInviteModalOpen(false)}
          onSubmit={handleInterviewInviteSubmit}
          submitting={inviteSubmitting}
        />
      )}
    </>
  )
}
