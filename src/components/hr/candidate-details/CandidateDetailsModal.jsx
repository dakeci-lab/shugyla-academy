import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock'
import { CloseIcon, ChevronDownIcon, LinkIcon } from '../../icons/PlatformIcons'
import CandidateAvatar from '../../CandidateAvatar'
import CandidateStatusBadge from '../CandidateStatusBadge'
import CandidatePhotoPreviewModal from '../../CandidatePhotoPreviewModal'
import { resolveAvatarUrl } from '../../../utils/avatarUtils'
import {
  formatDisplayValue,
  formatAgeYears,
  formatPhoneDisplay,
  formatPhoneTel,
  formatSalaryDisplay,
  formatTestResultSummary,
  parseInterviewAddress,
  getCandidateDetailActions,
} from '../../../utils/candidateDisplayUtils'
import {
  CANDIDATE_STATUS_LABELS,
  formatInterviewDateLabel,
  formatInterviewTimeLabel,
  hasInterviewInvitation,
  isCandidateEmployeeCreated,
} from '../../../utils/recruitmentData'
import { formatRecruitmentDate } from '../../admin/sections/recruitmentAdminShared'
import { toastSuccess } from '../../../services/notificationService'
import '../../CandidateAvatar.css'
import '../../CandidatePhotoPreviewModal.css'
import './CandidateDetailsModal.css'

function InfoField({ label, value, href, icon }) {
  const display = formatDisplayValue(value)
  const content = href && display !== 'Не указано' ? (
    <a href={href} className="candidate-info-field__link">
      {display}
    </a>
  ) : (
    display
  )

  return (
    <div className="candidate-info-field">
      <span className="candidate-info-field__label">{label}</span>
      <span className="candidate-info-field__value">
        {icon}
        {content}
      </span>
    </div>
  )
}

function CandidateSummaryCard({ candidate, vacancy, answerBreakdown, photoTriggerRef, onPhotoClick }) {
  const photoUrl = resolveAvatarUrl({ photoUrl: candidate.photoUrl })
  const testResult = formatTestResultSummary(candidate, answerBreakdown)
  const phoneDisplay = formatPhoneDisplay(candidate.phone)
  const cityDisplay = formatDisplayValue(candidate.city)

  return (
    <section className="candidate-summary-card" aria-label="Краткая сводка">
      <div className="candidate-summary-card__left">
        {photoUrl ? (
          <button
            ref={photoTriggerRef}
            type="button"
            className="candidate-detail-photo-btn candidate-summary-card__photo-btn"
            onClick={onPhotoClick}
            aria-label={`Открыть фотографию ${candidate.fullName}`}
          >
            <CandidateAvatar fullName={candidate.fullName} photoUrl={photoUrl} size="lg" />
            <span className="candidate-detail-photo-btn__zoom" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M14 10l6.1-6.1M9 21H3v-6M10 14l-6.1 6.1" />
              </svg>
            </span>
          </button>
        ) : (
          <div className="candidate-detail-photo-btn candidate-detail-photo-btn--static candidate-summary-card__photo-btn">
            <CandidateAvatar fullName={candidate.fullName} size="lg" />
          </div>
        )}

        <div className="candidate-summary-card__meta">
          {phoneDisplay && <p className="candidate-summary-card__phone">{phoneDisplay}</p>}
          {cityDisplay !== 'Не указано' && (
            <p className="candidate-summary-card__city">{cityDisplay}</p>
          )}
        </div>
      </div>

      <div className="candidate-summary-card__right">
        <div className="candidate-summary-card__score">
          {testResult.hasTest ? (
            <>
              <span className="candidate-summary-card__score-value">{testResult.percentLabel}</span>
              <span className="candidate-summary-card__score-detail">{testResult.detailLabel}</span>
            </>
          ) : (
            <>
              <span className="candidate-summary-card__score-empty">{testResult.detailLabel}</span>
              {testResult.hint && (
                <span className="candidate-summary-card__score-hint">{testResult.hint}</span>
              )}
            </>
          )}
        </div>

        <CandidateStatusBadge status={candidate.status} />

        <p className="candidate-summary-card__date">
          Заявка подана {formatRecruitmentDate(candidate.submittedAt)}
        </p>

        {vacancy?.title && (
          <p className="candidate-summary-card__vacancy">{vacancy.title}</p>
        )}
      </div>
    </section>
  )
}

function CandidateTextBlock({ title, text }) {
  const display = formatDisplayValue(text)
  return (
    <section className="candidate-text-block">
      <h3 className="candidate-section-title">{title}</h3>
      <div className="candidate-text-block__body">{display}</div>
    </section>
  )
}

function CandidateAnswersSection({ answerBreakdown, questionsCount }) {
  const [expanded, setExpanded] = useState(false)
  const count = answerBreakdown.length

  let emptyMessage = null
  if (questionsCount === 0) {
    emptyMessage = 'Для этой вакансии дополнительные вопросы не были настроены.'
  } else if (count === 0) {
    emptyMessage = 'Кандидат не ответил на дополнительные вопросы.'
  }

  return (
    <section className="candidate-answers-section">
      <button
        type="button"
        className="candidate-answers-section__toggle"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <h3 className="candidate-section-title candidate-answers-section__title">Ответы на вопросы</h3>
        {count > 0 && <span className="candidate-answers-section__count">{count}</span>}
        <span
          className={`candidate-answers-section__chevron ${expanded ? 'candidate-answers-section__chevron--open' : ''}`}
          aria-hidden="true"
        >
          <ChevronDownIcon size={18} />
        </span>
      </button>

      {expanded && (
        <div className="candidate-answers-section__content">
          {emptyMessage ? (
            <p className="candidate-answers-section__empty">{emptyMessage}</p>
          ) : (
            <ol className="candidate-answers-list">
              {answerBreakdown.map((row, index) => (
                <li key={row.questionId} className="candidate-answers-list__item">
                  <p className="candidate-answers-list__question">
                    <span className="candidate-answers-list__num">{index + 1}.</span>
                    {row.questionText}
                  </p>
                  <p className="candidate-answers-list__answer">{formatDisplayValue(row.selectedOption)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}

function CandidateAdminNotes({ initialNotes, onSave }) {
  const [notes, setNotes] = useState(initialNotes || '')
  const [saveState, setSaveState] = useState('idle')

  useEffect(() => {
    setNotes(initialNotes || '')
    setSaveState('idle')
  }, [initialNotes])

  const isDirty = notes !== (initialNotes || '')
  const isSaving = saveState === 'saving'

  async function handleSave() {
    if (!isDirty || isSaving) return
    setSaveState('saving')
    try {
      await onSave(notes)
      setSaveState('success')
      toastSuccess('Заметка сохранена')
      window.setTimeout(() => setSaveState('idle'), 2000)
    } catch {
      setSaveState('error')
    }
  }

  let saveLabel = 'Сохранить заметку'
  if (saveState === 'saving') saveLabel = 'Сохранение…'
  else if (saveState === 'success') saveLabel = 'Сохранено'
  else if (saveState === 'error') saveLabel = 'Ошибка — повторить'

  return (
    <section className="candidate-notes-section">
      <h3 className="candidate-section-title">Заметки администратора</h3>
      <textarea
        className="candidate-notes-section__textarea"
        rows={4}
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value)
          if (saveState === 'success' || saveState === 'error') setSaveState('idle')
        }}
        placeholder="Добавьте внутреннюю заметку о кандидате"
      />
      <button
        type="button"
        className={`btn btn--outline candidate-notes-section__save ${saveState === 'success' ? 'candidate-notes-section__save--success' : ''} ${saveState === 'error' ? 'candidate-notes-section__save--error' : ''}`}
        onClick={handleSave}
        disabled={!isDirty || isSaving}
      >
        {isSaving && <span className="candidate-btn-spinner" aria-hidden="true" />}
        {saveLabel}
      </button>
    </section>
  )
}

function CandidateInterviewCard({ candidate, onReCopy, reCopyLoading }) {
  if (!hasInterviewInvitation(candidate)) return null

  const address = parseInterviewAddress(candidate.interviewAddress)

  return (
    <section className="candidate-interview-card">
      <h3 className="candidate-interview-card__title">Собеседование</h3>
      <div className="candidate-interview-card__grid">
        <InfoField label="Дата" value={formatInterviewDateLabel(candidate.interviewDate)} />
        <InfoField label="Время" value={formatInterviewTimeLabel(candidate.interviewTime)} />
        <div className="candidate-info-field candidate-info-field--wide">
          <span className="candidate-info-field__label">Адрес</span>
          <span className="candidate-info-field__value">
            {address.label && address.label !== address.display && (
              <span>{address.label}</span>
            )}
            {address.url ? (
              <a
                href={address.url}
                target="_blank"
                rel="noopener noreferrer"
                className="candidate-interview-card__map-link"
              >
                <LinkIcon size={14} />
                Открыть в 2GIS
              </a>
            ) : (
              formatDisplayValue(candidate.interviewAddress)
            )}
          </span>
        </div>
        <InfoField
          label="Статус"
          value={CANDIDATE_STATUS_LABELS[candidate.status] || candidate.status}
        />
      </div>

      {candidate.interviewComment && (
        <div className="candidate-interview-card__comment">
          <span className="candidate-info-field__label">Комментарий</span>
          <p>{candidate.interviewComment}</p>
        </div>
      )}

      <button
        type="button"
        className="btn btn--outline candidate-interview-card__copy"
        onClick={onReCopy}
        disabled={reCopyLoading}
      >
        {reCopyLoading ? 'Копирование…' : 'Скопировать приглашение повторно'}
      </button>
    </section>
  )
}

function CandidateActionsFooter({
  candidate,
  actions,
  loadingAction,
  onInvite,
  onReject,
  onInterviewPassed,
  onToTrainee,
  onCreateEmployee,
  onRestoreToNew,
}) {
  const employeeCreated = isCandidateEmployeeCreated(candidate)

  return (
    <footer className="candidate-modal-footer">
      <div className="candidate-modal-footer__inner">
        <div className="candidate-modal-footer__secondary">
          {actions.reject && (
            <button
              type="button"
              className="btn candidate-modal-footer__btn candidate-modal-footer__btn--danger"
              onClick={onReject}
              disabled={Boolean(loadingAction)}
            >
              {loadingAction === 'reject' ? 'Обработка…' : 'Отклонить'}
            </button>
          )}
        </div>

        <div className="candidate-modal-footer__primary">
          {employeeCreated ? (
            <span className="candidate-hire-badge">Сотрудник создан</span>
          ) : (
            <>
              {actions.restoreToNew && (
                <button
                  type="button"
                  className="btn btn--outline candidate-modal-footer__btn candidate-modal-footer__btn--main"
                  onClick={onRestoreToNew}
                  disabled={Boolean(loadingAction)}
                >
                  {loadingAction === 'restore' ? 'Обработка…' : 'Вернуть в новые'}
                </button>
              )}
              {actions.invite && (
                <button
                  type="button"
                  className="btn btn--primary candidate-modal-footer__btn candidate-modal-footer__btn--main"
                  onClick={onInvite}
                  disabled={Boolean(loadingAction)}
                >
                  Пригласить на собеседование
                </button>
              )}
              {actions.interviewPassed && (
                <button
                  type="button"
                  className="btn btn--primary candidate-modal-footer__btn candidate-modal-footer__btn--main"
                  onClick={onInterviewPassed}
                  disabled={Boolean(loadingAction)}
                >
                  {loadingAction === 'interviewPassed' ? 'Обработка…' : 'Собеседование пройдено'}
                </button>
              )}
              {actions.toTrainee && (
                <button
                  type="button"
                  className="btn btn--primary candidate-modal-footer__btn candidate-modal-footer__btn--main"
                  onClick={onToTrainee}
                  disabled={Boolean(loadingAction)}
                >
                  {loadingAction === 'toTrainee' ? 'Обработка…' : 'Перевести в стажёры'}
                </button>
              )}
              {actions.createEmployee && (
                <button
                  type="button"
                  className="btn btn--primary candidate-modal-footer__btn candidate-modal-footer__btn--main"
                  onClick={onCreateEmployee}
                  disabled={Boolean(loadingAction)}
                >
                  Создать сотрудника
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </footer>
  )
}

/** Модальная карточка кандидата с sticky header/footer */
export default function CandidateDetailsModal({
  candidate,
  vacancy,
  answerBreakdown,
  questionsCount,
  onClose,
  onSaveNotes,
  onInvite,
  onReject,
  onReCopyInvitation,
  onRestoreToNew,
  onInterviewPassed,
  onToTrainee,
  onCreateEmployee,
}) {
  const photoTriggerRef = useRef(null)
  const [previewPhoto, setPreviewPhoto] = useState(null)
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false)
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
  const [loadingAction, setLoadingAction] = useState(null)
  const [actionError, setActionError] = useState('')

  useBodyScrollLock(Boolean(candidate))

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !previewPhoto && !rejectConfirmOpen && !restoreConfirmOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, previewPhoto, rejectConfirmOpen, restoreConfirmOpen])

  if (!candidate) return null

  const photoUrl = resolveAvatarUrl({ photoUrl: candidate.photoUrl })
  const actions = getCandidateDetailActions(candidate)
  const ageLabel = formatAgeYears(candidate.age)
  const phoneTel = formatPhoneTel(candidate.phone)
  const salaryLabel = formatSalaryDisplay(candidate.expectedSalary)

  async function runAction(key, actionFn) {
    setActionError('')
    setLoadingAction(key)
    try {
      await actionFn()
    } catch (err) {
      setActionError(err.message || 'Не удалось выполнить действие')
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleReCopy() {
    setActionError('')
    setLoadingAction('recopy')
    try {
      await onReCopyInvitation()
      toastSuccess('Приглашение скопировано')
    } catch (err) {
      setActionError(err.message || 'Не удалось скопировать приглашение')
    } finally {
      setLoadingAction(null)
    }
  }

  const modalContent = (
    <>
      <div className="candidate-details-overlay" onClick={onClose} role="presentation">
        <div
          className="candidate-details-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="candidate-modal-title"
        >
          <header className="candidate-modal-header">
            <div className="candidate-modal-header__text">
              <h2 id="candidate-modal-title" className="candidate-modal-header__title">
                {candidate.fullName}
              </h2>
              {vacancy?.title && (
                <p className="candidate-modal-header__subtitle">
                  Кандидат на вакансию «{vacancy.title}»
                </p>
              )}
            </div>
            <button
              type="button"
              className="candidate-modal-header__close"
              onClick={onClose}
              aria-label="Закрыть карточку кандидата"
            >
              <CloseIcon size={20} />
            </button>
          </header>

          <div className="candidate-modal-content">
            {actionError && <p className="candidate-modal-content__error">{actionError}</p>}

            <CandidateSummaryCard
              candidate={candidate}
              vacancy={vacancy}
              answerBreakdown={answerBreakdown}
              photoTriggerRef={photoTriggerRef}
              onPhotoClick={() => photoUrl && setPreviewPhoto(photoUrl)}
            />

            <section className="candidate-main-info">
              <h3 className="candidate-section-title">Основная информация</h3>
              <div className="candidate-main-info__grid">
                <InfoField label="Телефон" value={formatPhoneDisplay(candidate.phone) || candidate.phone} href={phoneTel} />
                <InfoField label="Вакансия" value={vacancy?.title} />
                <InfoField label="Возраст" value={ageLabel} />
                <InfoField label="Город" value={candidate.city} />
                <InfoField label="Опыт" value={candidate.experience} />
                <InfoField label="Желаемая зарплата" value={salaryLabel || candidate.expectedSalary} />
                <InfoField label="Готовность выйти" value={candidate.availableFrom} />
                <InfoField label="Дата заявки" value={formatRecruitmentDate(candidate.submittedAt)} />
              </div>
            </section>

            <CandidateTextBlock title="Опыт работы" text={candidate.previousWork} />
            <CandidateTextBlock title="О себе" text={candidate.about} />

            <CandidateAnswersSection
              answerBreakdown={answerBreakdown}
              questionsCount={questionsCount}
            />

            <CandidateAdminNotes
              initialNotes={candidate.adminNotes}
              onSave={onSaveNotes}
            />

            <CandidateInterviewCard
              candidate={candidate}
              onReCopy={handleReCopy}
              reCopyLoading={loadingAction === 'recopy'}
            />
          </div>

          <CandidateActionsFooter
            candidate={candidate}
            actions={actions}
            loadingAction={loadingAction}
            onInvite={onInvite}
            onReject={() => setRejectConfirmOpen(true)}
            onInterviewPassed={() => runAction('interviewPassed', onInterviewPassed)}
            onToTrainee={() => runAction('toTrainee', onToTrainee)}
            onCreateEmployee={onCreateEmployee}
            onRestoreToNew={() => setRestoreConfirmOpen(true)}
          />
        </div>
      </div>

      <CandidatePhotoPreviewModal
        photoUrl={previewPhoto}
        alt={`Фотография кандидата ${candidate.fullName}`}
        onClose={() => setPreviewPhoto(null)}
        triggerRef={photoTriggerRef}
      />

      {rejectConfirmOpen && (
        <div
          className="candidate-confirm-overlay"
          onClick={() => loadingAction !== 'reject' && setRejectConfirmOpen(false)}
          role="presentation"
        >
          <div
            className="candidate-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="candidate-reject-title"
          >
            <h3 id="candidate-reject-title" className="candidate-confirm-dialog__title">
              Отклонить кандидата?
            </h3>
            <p className="candidate-confirm-dialog__message">
              Вы уверены, что хотите отклонить {candidate.fullName}? Это действие изменит статус
              кандидата.
            </p>
            <div className="candidate-confirm-dialog__actions">
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => setRejectConfirmOpen(false)}
                disabled={loadingAction === 'reject'}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn candidate-modal-footer__btn--danger"
                onClick={async () => {
                  await runAction('reject', onReject)
                  setRejectConfirmOpen(false)
                }}
                disabled={loadingAction === 'reject'}
              >
                {loadingAction === 'reject' ? 'Обработка…' : 'Отклонить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreConfirmOpen && (
        <div
          className="candidate-confirm-overlay"
          onClick={() => loadingAction !== 'restore' && setRestoreConfirmOpen(false)}
          role="presentation"
        >
          <div
            className="candidate-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="candidate-restore-title"
          >
            <h3 id="candidate-restore-title" className="candidate-confirm-dialog__title">
              Вернуть кандидата в статус «Новый»?
            </h3>
            <p className="candidate-confirm-dialog__message">
              Кандидат снова появится среди активных анкет. Данные анкеты, ответы и заметки
              сохранятся.
            </p>
            <div className="candidate-confirm-dialog__actions">
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => setRestoreConfirmOpen(false)}
                disabled={loadingAction === 'restore'}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={async () => {
                  await runAction('restore', onRestoreToNew)
                  setRestoreConfirmOpen(false)
                  toastSuccess('Кандидат возвращён в новые')
                }}
                disabled={loadingAction === 'restore'}
              >
                {loadingAction === 'restore' ? 'Обработка…' : 'Вернуть в новые'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  return createPortal(modalContent, document.body)
}
