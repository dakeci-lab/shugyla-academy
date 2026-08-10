import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { can, PERMISSION_CODES } from '../../config/permissions'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../../context/ToastContext'
import {
  loadProcurementNormsModel,
  saveProcurementCategoryNorm,
  saveProcurementSubcategoryNorm,
} from '../../services/procurementNormsService'
import {
  applyCategoryNormToHierarchy,
  applySubcategoryNormToHierarchy,
  filterProcurementNormHierarchy,
} from './procurementNormsModel'
import PlatformSearchToolbar from '../platform/PlatformSearchToolbar'
import { CheckCheckIcon, ChevronDownIcon } from '../icons/PlatformIcons'
import './ProcurementNormsView.css'

const AUTO_SAVE_DELAY_MS = 650

function LockIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function AlertIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function TinySpinner() {
  return <span className="proc-norms__spinner" aria-hidden="true" />
}

function NormInput({ value, disabled, label, inherited = false, onSave }) {
  const [draft, setDraft] = useState(String(value))
  const [state, setState] = useState('idle')
  const timerRef = useRef(null)
  const requestedRef = useRef(Number(value))
  const sequenceRef = useRef(0)
  const saveChainRef = useRef(Promise.resolve())

  useEffect(() => {
    setDraft(String(value))
    requestedRef.current = Number(value)
  }, [value])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const commit = useCallback(
    (rawValue) => {
      clearTimeout(timerRef.current)
      if (disabled) return
      const parsed = Number(rawValue)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setState('error')
        return
      }
      const days = Math.round(parsed)
      setDraft(String(days))
      if (days === requestedRef.current) return

      requestedRef.current = days
      const sequence = ++sequenceRef.current
      setState('saving')
      saveChainRef.current = saveChainRef.current
        .catch(() => undefined)
        .then(() => onSave(days))
        .then(() => {
          if (sequence === sequenceRef.current) setState('saved')
        })
        .catch(() => {
          if (sequence === sequenceRef.current) setState('error')
        })
    },
    [disabled, onSave]
  )

  function handleChange(event) {
    const next = event.target.value
    setDraft(next)
    setState('idle')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => commit(next), AUTO_SAVE_DELAY_MS)
  }

  return (
    <div className={['proc-norms__norm', inherited ? 'is-inherited' : ''].filter(Boolean).join(' ')}>
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        value={draft}
        disabled={disabled}
        onChange={handleChange}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        aria-label={label}
        title={inherited ? 'Наследует норму категории' : label}
      />
      <span className={`proc-norms__save-state is-${state}`} aria-live="polite">
        {state === 'saving' ? <TinySpinner /> : null}
        {state === 'saved' ? <CheckCheckIcon size={15} /> : null}
        {state === 'error' ? <AlertIcon size={15} /> : null}
        <span className="sr-only">
          {state === 'saving' ? 'Сохранение' : state === 'saved' ? 'Сохранено' : state === 'error' ? 'Ошибка сохранения' : ''}
        </span>
      </span>
    </div>
  )
}

function readonlyMessage(snapshot, canEdit) {
  if (!canEdit) return 'Нет прав на изменение норм'
  if (snapshot?.status === 'generated' || snapshot?.status === 'closed') {
    return 'Снимок зафиксирован. Нормы можно изменить в новом рабочем снимке'
  }
  return 'Снимок пока не готов к редактированию'
}

/**
 * Isolated norms tab. ProcurementPage may render it without props; optional
 * snapshot avoids a duplicate latest-snapshot read when the parent already has it.
 */
export default function ProcurementNormsView({ snapshot: suppliedSnapshot = null, onNormSaved }) {
  const { user } = useSession()
  const { error: showError } = useToast()
  const [snapshot, setSnapshot] = useState(suppliedSnapshot)
  const [hierarchy, setHierarchy] = useState([])
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [loading, setLoading] = useState(true)

  const canEditNorms = can(user, PERMISSION_CODES.PROCUREMENT_EDIT)
  const editable =
    canEditNorms &&
    (snapshot?.status === 'ready' || snapshot?.status === 'partially_generated')
  const filteredHierarchy = useMemo(
    () => filterProcurementNormHierarchy(hierarchy, search),
    [hierarchy, search]
  )
  const searching = Boolean(search.trim())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadProcurementNormsModel({ snapshot: suppliedSnapshot })
      .then((model) => {
        if (cancelled) return
        setSnapshot(model.snapshot)
        setHierarchy(model.hierarchy)
      })
      .catch((err) => {
        if (!cancelled) showError(err.message || 'Не удалось загрузить нормы')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [suppliedSnapshot, showError])

  const saveCategory = useCallback(
    async (categoryName, normDays) => {
      try {
        await saveProcurementCategoryNorm({ snapshotId: snapshot.id, categoryName, normDays })
        setHierarchy((current) => applyCategoryNormToHierarchy(current, categoryName, normDays))
        onNormSaved?.({ scope: 'category', categoryName, normDays })
      } catch (err) {
        showError(err.message || 'Не удалось сохранить норму')
        throw err
      }
    },
    [snapshot?.id, onNormSaved, showError]
  )

  const saveSubcategory = useCallback(
    async (categoryName, subcategoryName, normDays) => {
      try {
        await saveProcurementSubcategoryNorm({
          snapshotId: snapshot.id,
          categoryName,
          subcategoryName,
          normDays,
        })
        setHierarchy((current) =>
          applySubcategoryNormToHierarchy(current, categoryName, subcategoryName, normDays)
        )
        onNormSaved?.({ scope: 'subcategory', categoryName, subcategoryName, normDays })
      } catch (err) {
        showError(err.message || 'Не удалось сохранить норму')
        throw err
      }
    },
    [snapshot?.id, onNormSaved, showError]
  )

  function toggleCategory(categoryName) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(categoryName)) next.delete(categoryName)
      else next.add(categoryName)
      return next
    })
  }

  return (
    <section className="proc-norms" aria-label="Нормы запаса">
      <PlatformSearchToolbar
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onClear={() => setSearch('')}
        showClear
        placeholder="Категория или подкатегория…"
        ariaLabel="Поиск нормы"
        actions={
          !loading && snapshot && !editable ? (
            <span className="proc-norms__readonly" title={readonlyMessage(snapshot, canEditNorms)} aria-label={readonlyMessage(snapshot, canEditNorms)}>
              <LockIcon />
            </span>
          ) : null
        }
      />

      {loading ? (
        <div className="proc-norms__loading" role="status" aria-label="Загрузка норм">
          <TinySpinner />
        </div>
      ) : !snapshot?.id ? (
        <p className="proc-norms__empty">Синхронизируйте UMAG</p>
      ) : filteredHierarchy.length === 0 ? (
        <p className="proc-norms__empty">{search.trim() ? 'Не найдено' : 'Категорий нет'}</p>
      ) : (
        <div className="proc-norms__list">
          {filteredHierarchy.map((category) => {
            const open = searching || expanded.has(category.categoryName)
            const panelId = `proc-norms-${encodeURIComponent(category.categoryName || 'empty')}`
            return (
              <article className="proc-norms__category" key={category.categoryName || '__empty__'}>
                <div className="proc-norms__category-row">
                  <button
                    type="button"
                    className="proc-norms__category-toggle"
                    onClick={() => toggleCategory(category.categoryName)}
                    aria-expanded={open}
                    aria-controls={panelId}
                  >
                    <span className="proc-norms__chevron" aria-hidden="true"><ChevronDownIcon size={17} /></span>
                    <strong>{category.label}</strong>
                    <span className="proc-norms__count">{category.subcategories.length}</span>
                  </button>
                  <NormInput
                    value={category.normDays}
                    disabled={!editable}
                    label={`Норма категории ${category.label}, дней`}
                    onSave={(days) => saveCategory(category.categoryName, days)}
                  />
                </div>

                {open ? (
                  <div className="proc-norms__subcategories" id={panelId}>
                    {category.subcategories.map((subcategory) => (
                      <div className="proc-norms__subcategory" key={subcategory.subcategoryName}>
                        <span title={subcategory.label}>{subcategory.label}</span>
                        <NormInput
                          value={subcategory.normDays}
                          disabled={!editable}
                          inherited={!subcategory.hasOverride}
                          label={`Норма подкатегории ${subcategory.label}, дней`}
                          onSave={(days) =>
                            saveSubcategory(category.categoryName, subcategory.subcategoryName, days)
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
