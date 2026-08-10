import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { canAcceptSimpleDelivery } from '../../config/permissions'
import {
  acceptSimpleDelivery,
  unacceptSimpleDelivery,
} from '../../services/receivingDataService'
import { useAdminRefresh } from '../../hooks/useAdminRefresh'
import { useWeekScheduleState } from '../../hooks/useWeekScheduleState'
import { isSimpleWorkflow } from '../../utils/procurementWorkflow'
import {
  formatReceivingDate,
  RECEIVING_STATUS,
} from '../../utils/receivingData'
import {
  countReceivingDocumentsByDate,
  filterReceivingDocuments,
  RECEIVING_LIST_STATUS,
} from '../../utils/receivingList'
import { toUserErrorMessage } from '../../utils/userErrorMessage'
import PlatformSearchToolbar from '../platform/PlatformSearchToolbar'
import IconActionButton from '../admin/IconActionButton'
import {
  CheckCheckIcon,
  EyeIcon,
  FileTextIcon,
  RotateCcwIcon,
} from '../icons/PlatformIcons'
import WeekScheduleNav from '../procurement/WeekScheduleNav'
import { ReceivingStatusBadge } from './ReceivingStatsCards'
import './UnifiedReceivingList.css'

export default function UnifiedReceivingList({ documents = [] }) {
  const { user } = useSession()
  const { notifyChange } = useAdminRefresh()
  const {
    selectedDateKey,
    setSelectedDateKey,
    weekDates,
    weekTitle,
    todayKey,
    changeWeek,
    goToday,
  } = useWeekScheduleState()
  const [supplierQuery, setSupplierQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(RECEIVING_LIST_STATUS.ALL)
  const [updatingId, setUpdatingId] = useState(null)
  const [actionError, setActionError] = useState('')

  const canAccept = canAcceptSimpleDelivery(user)
  const countsByDate = useMemo(
    () => countReceivingDocumentsByDate(documents),
    [documents]
  )
  const visibleDocuments = useMemo(
    () =>
      filterReceivingDocuments(documents, {
        dateKey: selectedDateKey,
        status: statusFilter,
        supplierQuery,
      }),
    [documents, selectedDateKey, statusFilter, supplierQuery]
  )

  async function handleLegacyStatus(document) {
    if (!canAccept || !document?.id || updatingId) return

    const isReceived = document.status === RECEIVING_STATUS.RECEIVED
    setUpdatingId(document.id)
    setActionError('')
    try {
      if (isReceived) {
        await unacceptSimpleDelivery(document.id)
      } else {
        await acceptSimpleDelivery(document.id, user)
      }
      notifyChange()
    } catch (error) {
      setActionError(
        toUserErrorMessage(error, 'Не удалось изменить статус поставки.')
      )
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <section className="unified-receiving" aria-label="Ожидаемые поставки">
      <WeekScheduleNav
        weekTitle={weekTitle}
        weekDates={weekDates}
        selectedDateKey={selectedDateKey}
        todayKey={todayKey}
        countsByDate={countsByDate}
        onPrevWeek={() => changeWeek(-1)}
        onNextWeek={() => changeWeek(1)}
        onToday={goToday}
        onSelectDate={setSelectedDateKey}
      />

      <PlatformSearchToolbar
        value={supplierQuery}
        onChange={(event) => setSupplierQuery(event.target.value)}
        onClear={() => setSupplierQuery('')}
        showClear
        placeholder="Поставщик…"
        ariaLabel="Поиск поставщика"
        actions={
          <select
            className="unified-receiving__status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Статус поставки"
            title="Статус поставки"
          >
            <option value={RECEIVING_LIST_STATUS.ALL}>Все</option>
            <option value={RECEIVING_LIST_STATUS.OPEN}>Ожидают</option>
            <option value={RECEIVING_LIST_STATUS.RECEIVED}>Приняты</option>
            <option value={RECEIVING_LIST_STATUS.CANCELLED}>Отменены</option>
          </select>
        }
      />

      {actionError ? (
        <p className="unified-receiving__error" role="alert">
          {actionError}
        </p>
      ) : null}

      {visibleDocuments.length === 0 ? (
        <p className="unified-receiving__empty">Поставок нет.</p>
      ) : (
        <ul className="unified-receiving__list" role="list">
          {visibleDocuments.map((document) => {
            const isLegacy = isSimpleWorkflow(document)
            const itemsCount = document.itemsCount ?? document.items?.length ?? 0
            const isReceived = document.status === RECEIVING_STATUS.RECEIVED
            const actionLabel = isReceived
              ? `Вернуть в ожидание: ${document.supplierName || 'поставка'}`
              : `Принять поставку: ${document.supplierName || 'поставка'}`

            return (
              <li key={document.id}>
                <article
                  className={`unified-receiving-card${isLegacy ? ' unified-receiving-card--legacy' : ''}`}
                >
                  <div className="unified-receiving-card__icon" aria-hidden="true">
                    <FileTextIcon size={19} />
                  </div>

                  <div className="unified-receiving-card__content">
                    <strong className="unified-receiving-card__supplier">
                      {document.supplierName || 'Поставщик'}
                    </strong>
                    <div className="unified-receiving-card__meta">
                      <span>{formatReceivingDate(document.expectedDeliveryDate)}</span>
                      {isLegacy ? (
                        <span title="Старый документ без товарных позиций">Без состава</span>
                      ) : (
                        <span>{itemsCount} поз.</span>
                      )}
                      {!isLegacy && Number(document.totalOrderedQty) > 0 ? (
                        <span>{Number(document.totalOrderedQty)} шт.</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="unified-receiving-card__status">
                    <ReceivingStatusBadge status={document.status} />
                  </div>

                  <div className="unified-receiving-card__actions">
                    {isLegacy ? (
                      canAccept && document.status !== RECEIVING_STATUS.CANCELLED ? (
                        <IconActionButton
                          label={actionLabel}
                          variant={isReceived ? 'neutral' : 'primary'}
                          disabled={updatingId === document.id}
                          onClick={() => void handleLegacyStatus(document)}
                        >
                          {isReceived ? (
                            <RotateCcwIcon size={18} />
                          ) : (
                            <CheckCheckIcon size={18} />
                          )}
                        </IconActionButton>
                      ) : null
                    ) : (
                      <Link
                        to={`/platform/receiving/${document.id}`}
                        className="unified-receiving-card__open"
                        aria-label={`Открыть поставку: ${document.supplierName || 'поставщик'}`}
                        title="Открыть документ"
                      >
                        <EyeIcon size={18} />
                      </Link>
                    )}
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
