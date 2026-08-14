import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { usePlatformPageTitle } from '../../../context/PlatformPageTitleContext'
import { canReceiveGoods, canViewReceivingDocuments } from '../../../config/permissions'
import {
  completeReceivingDocument,
  loadReceivingDocumentById,
  recordReceivingUmagExport,
  saveReceivingDocument,
  startReceivingDocument,
  uploadReceivingItemPhotos,
} from '../../../services/receivingDataService'
import {
  fetchLatestProcurementSnapshot,
  fetchSnapshotItemsPage,
} from '../../../services/procurementPlanningService'
import {
  buildReceivingUmagComment,
  buildReceivingUmagFilename,
  createReceivingUmagXlsx,
  downloadReceivingUmagXlsxBytes,
  normalizeReceivingUmagUnit,
} from '../../../utils/receivingUmagExport.js'
import { formatReceivingDate, RECEIVING_STATUS } from '../../../utils/receivingData'
import { toUserErrorMessage } from '../../../utils/userErrorMessage'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import AdminModal from '../../../components/admin/AdminModal'
import IconActionButton from '../../../components/admin/IconActionButton'
import {
  CopyIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
} from '../../../components/icons/PlatformIcons'
import { DelayedLoadingSkeleton } from '../../../components/loading/LoadingSkeleton'
import { ReceivingStatusBadge } from '../../../components/receiving/ReceivingStatsCards'
import ReceivingItemsTable, {
  getReceivingItemFlags,
  hasReceivingItemException,
  isPieceUnit,
} from '../../../components/receiving/ReceivingItemsTable'
import '../../../components/admin/admin-shared.css'
import './ReceivingDetailPage.css'

const COMPLETED_STATUSES = new Set([
  RECEIVING_STATUS.RECEIVED,
  RECEIVING_STATUS.PARTIALLY_RECEIVED,
  'partial',
])

function getInvoiceNumbers(document) {
  const value =
    document?.supplierInvoiceNumbers ??
    document?.supplier_invoice_numbers ??
    document?.invoiceNumbers ??
    document?.invoice_numbers ??
    ''
  return Array.isArray(value) ? value.join(', ') : String(value || '')
}

function splitInvoiceNumbers(value) {
  return String(value || '')
    .split(/[,;\n]+/)
    .map((number) => number.trim())
    .filter(Boolean)
}

function makeClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `receiving-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeEditableItem(raw) {
  const orderedQty = raw?.orderedQty ?? raw?.ordered_qty ?? 0
  const savedReceivedQty = raw?.receivedQty ?? raw?.received_qty ?? 0
  const orderedPurchasePrice =
    raw?.orderedPurchasePrice ??
    raw?.ordered_purchase_price ??
    raw?.purchasePrice ??
    raw?.purchase_price ??
    0
  const actualPurchasePrice =
    raw?.actualPurchasePrice ??
    raw?.actual_purchase_price ??
    raw?.purchasePrice ??
    raw?.purchase_price ??
    0
  return {
    ...raw,
    id: raw?.id || makeClientId(),
    productName: raw?.productName ?? raw?.product_name ?? '',
    barcode: String(raw?.barcode ?? ''),
    unit: raw?.unit ?? raw?.measure ?? raw?.unit_name ?? '',
    orderedQty,
    receivedQty: savedReceivedQty,
    orderedPurchasePrice,
    actualPurchasePrice,
    purchasePrice: actualPurchasePrice,
    isOutsideOrder: Boolean(raw?.isOutsideOrder ?? raw?.is_outside_order),
    discrepancyReason:
      raw?.discrepancyReason ?? raw?.discrepancy_reason ??
      raw?.discrepancyReasonCode ?? raw?.discrepancy_reason_code ?? '',
    discrepancyReasonCode:
      raw?.discrepancyReasonCode ?? raw?.discrepancy_reason_code ?? '',
    comment: raw?.comment ?? '',
    photoPaths: raw?.photoPaths ?? raw?.photo_paths ?? [],
    photoUrls: raw?.photoUrls ?? raw?.photo_urls ?? [],
    photoMetadata: raw?.photoMetadata ?? raw?.photo_metadata ?? [],
    pendingPhotoFiles: [],
  }
}

function prepareItemsForSave(items) {
  return items.map((item, index) => ({
    ...item,
    orderedQty: Number(item.orderedQty || 0),
    receivedQty: Number(item.receivedQty || 0),
    orderedPurchasePrice: Number(item.orderedPurchasePrice || 0),
    actualPurchasePrice: Number(item.actualPurchasePrice || 0),
    purchasePrice: Number(item.actualPurchasePrice || 0),
    differenceQty: Number(item.receivedQty || 0) - Number(item.orderedQty || 0),
    sortOrder: index,
  }))
}

function validateReceivingItems(items) {
  if (items.length === 0) return 'В приёмке нет товарных позиций.'

  const seenBarcodes = new Set()

  function hasAtMostDecimalPlaces(value, decimalPlaces) {
    const factor = 10 ** decimalPlaces
    return Math.abs(value * factor - Math.round(value * factor)) < 0.000001
  }

  for (const [index, item] of items.entries()) {
    const rowNumber = index + 1
    const rawReceivedQty = String(item.receivedQty ?? '').trim()
    const rawActualPrice = String(item.actualPurchasePrice ?? '').trim()
    const receivedQty = Number(item.receivedQty)
    const actualPrice = Number(item.actualPurchasePrice)
    if (!String(item.productName || '').trim()) return `Позиция ${rowNumber}: не указано название.`
    const barcode = String(item.barcode || '').trim()
    if (!barcode) return `Позиция ${rowNumber}: нет штрихкода UMAG.`
    if (seenBarcodes.has(barcode)) return `Позиция ${rowNumber}: штрихкод ${barcode} повторяется.`
    seenBarcodes.add(barcode)
    if (!String(item.unit || '').trim()) return `Позиция ${rowNumber}: не указана единица измерения.`
    if (!normalizeReceivingUmagUnit(item.unit)) {
      return `Позиция ${rowNumber}: единица «${item.unit}» не поддерживается UMAG.`
    }
    if (!rawReceivedQty || !Number.isFinite(receivedQty) || receivedQty < 0) {
      return `Позиция ${rowNumber}: укажите корректное принятое количество.`
    }
    if (isPieceUnit(item.unit) && !Number.isInteger(receivedQty)) {
      return `Позиция ${rowNumber}: количество в штуках должно быть целым.`
    }
    if (!isPieceUnit(item.unit) && !hasAtMostDecimalPlaces(receivedQty, 3)) {
      return `Позиция ${rowNumber}: для кг и л допустимо не более 3 знаков после запятой.`
    }
    if (!rawActualPrice || !Number.isFinite(actualPrice) || actualPrice < 0) {
      return `Позиция ${rowNumber}: укажите корректную фактическую цену.`
    }
    if (!hasAtMostDecimalPlaces(actualPrice, 2)) {
      return `Позиция ${rowNumber}: цена должна иметь не более 2 знаков после запятой.`
    }
  }

  return ''
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
  })} ₸`
}

async function copyTextToClipboard(value) {
  const text = String(value || '')
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // Insecure local contexts may expose the API but reject writes.
  }

  const dom = globalThis.document
  if (!dom?.body || typeof dom.execCommand !== 'function') {
    throw new Error('Clipboard API is unavailable')
  }
  const textarea = dom.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  dom.body.appendChild(textarea)
  textarea.select()
  const copied = dom.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Copy command failed')
}

function OutsideOrderPicker({ supplierId, onSelect, onClose }) {
  const [snapshotId, setSnapshotId] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchLatestProcurementSnapshot()
      .then((snapshot) => {
        if (!active) return
        if (!snapshot?.id) throw new Error('Синхронизированная номенклатура не найдена.')
        setSnapshotId(snapshot.id)
      })
      .catch((loadError) => {
        if (active) setError(toUserErrorMessage(loadError, 'Не удалось открыть номенклатуру.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!snapshotId) return undefined
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      fetchSnapshotItemsPage({
        snapshotId,
        page: 1,
        pageSize: 30,
        search: query,
        platformSupplierId: supplierId || '',
      })
        .then((result) => {
          if (active) setItems(result.items || [])
        })
        .catch((loadError) => {
          if (active) setError(toUserErrorMessage(loadError, 'Не удалось загрузить товары.'))
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 220)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query, snapshotId, supplierId])

  return (
    <AdminModal title="Добавить товар вне заказа" onClose={onClose} wide autoFocusClose={false}>
      <div className="receiving-catalog">
        <label className="receiving-catalog__search">
          <span>Поиск в синхронизированной номенклатуре</span>
          <input
            type="search"
            value={query}
            placeholder="Название или штрихкод"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p className="receiving-catalog__hint">
          Новый товар здесь создать нельзя. Сначала добавьте его в номенклатуру и синхронизируйте данные.
        </p>
        {error ? <p className="receiving-detail__error">{error}</p> : null}
        {loading ? (
          <p className="receiving-catalog__state">Загрузка товаров…</p>
        ) : items.length === 0 ? (
          <p className="receiving-catalog__state">Подходящих товаров нет.</p>
        ) : (
          <ul className="receiving-catalog__list">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onSelect(item)}>
                  <span>
                    <strong>{item.productName}</strong>
                    <small>
                      {item.barcode || 'Без штрихкода'}
                      {item.measure ? ` · ${item.measure}` : ' · единица не указана'}
                    </small>
                  </span>
                  <span>{formatMoney(item.purchasePrice)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminModal>
  )
}

export default function ReceivingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const canView = canViewReceivingDocuments(user)
  const canManage = canReceiveGoods(user)
  const startRequestRef = useRef('')
  const [document, setDocument] = useState(null)
  const [items, setItems] = useState([])
  const [invoiceNumbersText, setInvoiceNumbersText] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startAttempt, setStartAttempt] = useState(0)
  const [startFailed, setStartFailed] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [editingCompleted, setEditingCompleted] = useState(false)
  const [exceptionsOnly, setExceptionsOnly] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)

  const loadDocument = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    setLoadError('')
    try {
      const nextDocument = await loadReceivingDocumentById(id)
      setDocument(nextDocument)
    } catch (error) {
      setDocument(null)
      setLoadError(toUserErrorMessage(error, 'Не удалось загрузить документ поставки.'))
    } finally {
      setLoading(false)
    }
  }, [canView, id])

  useEffect(() => {
    void loadDocument()
  }, [loadDocument])

  useEffect(() => {
    if (
      !canManage ||
      !document ||
      document.status !== RECEIVING_STATUS.AWAITING_RECEIVING
    ) return undefined
    const requestKey = `${document.id}:${document.version ?? ''}:${startAttempt}`
    if (startRequestRef.current === requestKey) return undefined
    startRequestRef.current = requestKey
    setStarting(true)
    setStartFailed(false)
    setActionError('')
    startReceivingDocument(document.id, { expectedVersion: document.version })
      .then((started) => {
        if (started) setDocument(started)
      })
      .catch((error) => {
        startRequestRef.current = ''
        setStartFailed(true)
        setActionError(toUserErrorMessage(error, 'Не удалось начать приёмку.'))
      })
      .finally(() => {
        setStarting(false)
      })
    return undefined
  }, [canManage, document?.id, document?.status, document?.version, startAttempt])

  useEffect(() => {
    if (!document) return
    setItems((document.items || []).map(normalizeEditableItem))
    setInvoiceNumbersText(getInvoiceNumbers(document))
    setReviewing(false)
    setEditingCompleted(false)
  }, [document])

  const completed = COMPLETED_STATUSES.has(document?.status)
  const cancelled = document?.status === RECEIVING_STATUS.CANCELLED
  const readOnly = !canManage || starting || cancelled || (completed && !editingCompleted)
  const exceptionCount = useMemo(
    () => items.filter(hasReceivingItemException).length,
    [items]
  )
  const totals = useMemo(() => {
    return items.reduce(
      (result, item) => {
        const flags = getReceivingItemFlags(item)
        result.orderedAmount += flags.orderedQty * flags.orderedPrice
        result.actualAmount += flags.receivedQty * flags.actualPrice
        result.orderedQty += flags.orderedQty
        result.receivedQty += flags.receivedQty
        return result
      },
      { orderedAmount: 0, actualAmount: 0, orderedQty: 0, receivedQty: 0 }
    )
  }, [items])
  const exportableItemsCount = useMemo(
    () => items.filter((item) => Number(item.receivedQty) > 0).length,
    [items]
  )
  const parsedInvoiceNumbers = useMemo(
    () => splitInvoiceNumbers(invoiceNumbersText),
    [invoiceNumbersText]
  )

  /**
   * На телефоне системный Back открывает drawer, поэтому карточке приёмки
   * нужна собственная кнопка «Назад» в шапке — как у карточки закупа.
   * Вызов стоит до ранних return'ов: хук обязан выполняться на каждом рендере.
   */
  usePlatformPageTitle('Приёмка', '', {
    showBack: true,
    backFallback: '/platform/receiving',
  })

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Приёмка»" />
  }

  if (loading) {
    return (
      <div className="receiving-detail" aria-busy="true">
        <DelayedLoadingSkeleton variant="table" count={6} />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="receiving-detail receiving-detail__state">
        <p className="receiving-detail__error" role="alert">{loadError}</p>
        <IconActionButton label="Повторить загрузку" onClick={() => void loadDocument()}>
          <RotateCcwIcon size={18} />
        </IconActionButton>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="receiving-detail">
        <p className="receiving-detail__empty">Документ не найден.</p>
        <Link to="/platform/receiving" className="btn btn--ghost">← К приёмке</Link>
      </div>
    )
  }

  function updateItem(rowIndex, patch) {
    setItems((current) =>
      current.map((item, index) => (index === rowIndex ? { ...item, ...patch } : item))
    )
    setActionError('')
    setMessage('')
  }

  function removeOutsideOrderItem(rowIndex) {
    setItems((current) => current.filter((_, index) => index !== rowIndex))
  }

  function setAllAsOrdered() {
    setItems((current) =>
      current.map((item) =>
        item.isOutsideOrder
          ? item
          : {
              ...item,
              receivedQty: item.orderedQty,
              actualPurchasePrice: item.orderedPurchasePrice,
            }
      )
    )
    setActionError('')
  }

  function selectOutsideOrderProduct(product) {
    const barcode = String(product.barcode || '')
    if (items.some((item) => barcode && String(item.barcode) === barcode)) {
      setCatalogOpen(false)
      setActionError('Этот товар уже есть в приёмке.')
      return
    }

    const purchasePrice = Number(product.purchasePrice || 0)
    const unit = String(product.measure || '').trim()
    setItems((current) => [
      ...current,
      {
        id: makeClientId(),
        purchaseOrderItemId: null,
        catalogProductId: product.id,
        productName: product.productName,
        barcode,
        unit,
        orderedQty: 0,
        receivedQty: isPieceUnit(unit) ? 1 : unit ? 0.001 : 0,
        orderedPurchasePrice: purchasePrice,
        actualPurchasePrice: purchasePrice,
        purchasePrice,
        isOutsideOrder: true,
        discrepancyReason: 'Вне заказа',
        discrepancyReasonCode: 'other',
        comment: '',
        photoPaths: [],
        photoUrls: [],
        photoMetadata: [],
        pendingPhotoFiles: [],
      },
    ])
    setCatalogOpen(false)
    setActionError('')
  }

  function buildMetadata() {
    return {
      supplierInvoiceNumbers: parsedInvoiceNumbers,
      supplier_invoice_numbers: parsedInvoiceNumbers,
      expectedVersion: document.version,
      reopenCompleted: completed,
    }
  }

  async function uploadPendingPhotos() {
    const itemsWithPhotos = await uploadReceivingItemPhotos(document.id, items)
    setItems(itemsWithPhotos)
    return itemsWithPhotos
  }

  async function handleSaveDraft() {
    const validationError = validateReceivingItems(items)
    if (validationError) {
      setActionError(validationError)
      return
    }
    setSaving(true)
    setActionError('')
    setMessage('')
    try {
      const itemsWithPhotos = await uploadPendingPhotos()
      const saved = await saveReceivingDocument(
        document.id,
        prepareItemsForSave(itemsWithPhotos),
        user,
        buildMetadata()
      )
      if (saved) {
        setDocument({
          ...saved,
          supplierInvoiceNumbers: parsedInvoiceNumbers,
        })
      }
      setMessage('Черновик сохранён.')
    } catch (error) {
      setActionError(toUserErrorMessage(error, 'Не удалось сохранить черновик.'))
    } finally {
      setSaving(false)
    }
  }

  function openReview() {
    const validationError = validateReceivingItems(items)
    if (validationError) {
      setActionError(validationError)
      return
    }
    setActionError('')
    setReviewing(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleComplete() {
    if (saving) return
    setSaving(true)
    setActionError('')
    try {
      const itemsWithPhotos = await uploadPendingPhotos()
      await completeReceivingDocument(
        document.id,
        prepareItemsForSave(itemsWithPhotos),
        user,
        buildMetadata()
      )
      navigate('/platform/receiving', { replace: true })
    } catch (error) {
      setActionError(toUserErrorMessage(error, 'Не удалось завершить приёмку.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleExportUmag() {
    if (saving) return
    setSaving(true)
    setActionError('')
    setMessage('')
    try {
      const exportVersion = Number(document.exportVersion || 0) + 1
      const exported = await createReceivingUmagXlsx(prepareItemsForSave(items))
      const { totalQuantity, totalAmount } = exported.totals
      const exportOptions = {
        ...document,
        supplierInvoiceNumbers: parsedInvoiceNumbers,
        version: exportVersion,
        // Не document.totalAmount: в имени файла стоит принятая сумма, а не заказанная.
        exportTotalAmount: totalAmount,
      }
      const fileName = buildReceivingUmagFilename(exportOptions)
      const umagComment = buildReceivingUmagComment(exportOptions)
      await recordReceivingUmagExport(document.id, {
        expectedVersion: document.version,
        expectedExportVersion: document.exportVersion,
        fileName,
        rowCount: exported.rowsCount,
        totalQuantity,
        totalAmount,
        umagComment,
      })
      await downloadReceivingUmagXlsxBytes(exported.bytes, fileName)
      await loadDocument()
      setMessage('Файл для UMAG скачан.')
    } catch (error) {
      setActionError(toUserErrorMessage(error, 'Не удалось подготовить файл для UMAG.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyComment() {
    setActionError('')
    setMessage('')
    try {
      await copyTextToClipboard(buildReceivingUmagComment({
        ...document,
        supplierInvoiceNumbers: parsedInvoiceNumbers,
      }))
      setMessage('Комментарий для UMAG скопирован.')
    } catch (error) {
      setActionError('Не удалось скопировать комментарий. Скопируйте его вручную.')
    }
  }

  async function handleRetryStart() {
    startRequestRef.current = ''
    setStartFailed(false)
    setActionError('')
    await loadDocument()
  }

  const umagComment = buildReceivingUmagComment({
    ...document,
    supplierInvoiceNumbers: parsedInvoiceNumbers,
  })

  return (
    <div className="receiving-detail">
      <div className="receiving-detail__back">
        <Link to="/platform/receiving">← К приёмке</Link>
      </div>

      <header className="receiving-detail__header">
        <div>
          <div className="receiving-detail__eyebrow">
            {reviewing
              ? 'Проверка перед завершением'
              : cancelled
                ? 'Отменённая приёмка'
                : completed && readOnly
                  ? 'Завершённая приёмка'
                  : starting
                    ? 'Начало приёмки'
                    : !canManage
                      ? 'Просмотр приёмки'
                      : 'Приёмка товара'}
          </div>
          <h2>{document.supplierName || 'Поставка'}</h2>
          <div className="receiving-detail__header-meta">
            <ReceivingStatusBadge status={document.status} />
            <span>{formatReceivingDate(document.expectedDeliveryDate)}</span>
            <span>{items.length} поз.</span>
          </div>
        </div>
        {readOnly && completed && canManage ? (
          <button
            type="button"
            className="btn btn--outline receiving-detail__edit-button"
            onClick={() => {
              setEditingCompleted(true)
              setActionError('')
              setMessage('')
            }}
          >
            <PencilIcon size={17} />
            Изменить
          </button>
        ) : null}
      </header>

      {actionError ? <p className="receiving-detail__error" role="alert">{actionError}</p> : null}
      {startFailed && canManage ? (
        <button
          type="button"
          className="btn btn--outline receiving-detail__retry-start"
          onClick={() => void handleRetryStart()}
        >
          Повторить начало приёмки
        </button>
      ) : null}
      {starting ? (
        <p className="receiving-detail__message" role="status">Начинаем приёмку…</p>
      ) : null}
      {message ? <p className="receiving-detail__message" role="status">{message}</p> : null}

      {reviewing ? (
        <>
          <section className="receiving-review-summary">
            <div>
              <span>Расхождений</span>
              <strong>{exceptionCount}</strong>
            </div>
            <div>
              <span>Заказано</span>
              <strong>{formatMoney(totals.orderedAmount)}</strong>
            </div>
            <div>
              <span>Будет принято</span>
              <strong>{formatMoney(totals.actualAmount)}</strong>
            </div>
          </section>
          <section className="receiving-detail__section">
            <div className="receiving-detail__section-heading">
              <div>
                <h3>Проверьте изменения</h3>
                <p>Здесь показаны только несовпадающие позиции, изменения цены и товары вне заказа.</p>
              </div>
            </div>
            <ReceivingItemsTable items={items} readOnly exceptionsOnly />
          </section>
          <div className="receiving-detail__footer-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setReviewing(false)}>
              Вернуться к приёмке
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={saving}
              onClick={() => void handleComplete()}
            >
              {saving ? 'Завершение…' : 'Завершить приёмку'}
            </button>
          </div>
        </>
      ) : (
        <>
          <section className="receiving-detail__summary">
            <div><span>Заказано</span><strong>{formatMoney(totals.orderedAmount)}</strong></div>
            <div><span>Фактически</span><strong>{formatMoney(totals.actualAmount)}</strong></div>
            <div><span>Изменений</span><strong>{exceptionCount}</strong></div>
          </section>

          <section className="receiving-detail__invoice">
            <label>
              <span>Номер(а) накладных поставщика</span>
              <input
                type="text"
                value={invoiceNumbersText}
                readOnly={readOnly}
                placeholder="Например, 18275, 18276 — необязательно"
                onChange={(event) => setInvoiceNumbersText(event.target.value)}
              />
            </label>
            <small>Если накладных несколько, укажите номера через запятую.</small>
          </section>

          {readOnly && completed ? (
            <section className="receiving-detail__umag-panel">
              <div>
                <span>Комментарий для UMAG</span>
                <strong>{umagComment}</strong>
              </div>
              <div className="receiving-detail__umag-actions">
                <button type="button" className="btn btn--outline" onClick={() => void handleCopyComment()}>
                  <CopyIcon size={17} />
                  Скопировать комментарий
                </button>
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={saving || exportableItemsCount === 0}
                    title={exportableItemsCount === 0 ? 'Нет принятых позиций для выгрузки' : undefined}
                    onClick={() => void handleExportUmag()}
                  >
                    <DownloadIcon size={17} />
                    Скачать для UMAG
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="receiving-detail__section">
            <div className="receiving-detail__section-heading">
              <div>
                <h3>Товары</h3>
                <p>{readOnly ? 'Фактически принятые позиции.' : 'Измените только фактическое количество или цену.'}</p>
              </div>
              {!readOnly ? (
                <div className="receiving-detail__item-actions">
                  <div className="receiving-detail__view-toggle" role="group" aria-label="Показать позиции">
                    <button
                      type="button"
                      className={!exceptionsOnly ? 'is-active' : ''}
                      aria-pressed={!exceptionsOnly}
                      onClick={() => setExceptionsOnly(false)}
                    >
                      Все позиции
                    </button>
                    <button
                      type="button"
                      className={exceptionsOnly ? 'is-active' : ''}
                      aria-pressed={exceptionsOnly}
                      onClick={() => setExceptionsOnly(true)}
                    >
                      Изменения{exceptionCount > 0 ? ` (${exceptionCount})` : ''}
                    </button>
                  </div>
                  <button type="button" className="btn btn--outline btn--sm" onClick={setAllAsOrdered}>
                    Всё как заказано
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => setCatalogOpen(true)}
                  >
                    <PlusIcon size={16} />
                    Добавить вне заказа
                  </button>
                </div>
              ) : null}
            </div>
            <ReceivingItemsTable
              items={items}
              readOnly={readOnly}
              exceptionsOnly={!readOnly && exceptionsOnly}
              onChangeItem={updateItem}
              onRemoveItem={removeOutsideOrderItem}
            />
          </section>

          {!readOnly ? (
            <div className="receiving-detail__footer-actions">
              {completed ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setEditingCompleted(false)
                    setDocument({ ...document })
                  }}
                >
                  Отменить изменения
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn--outline"
                disabled={saving}
                onClick={() => void handleSaveDraft()}
              >
                {saving ? 'Сохранение…' : 'Сохранить черновик'}
              </button>
              <button type="button" className="btn btn--primary" disabled={saving} onClick={openReview}>
                Проверить и завершить
              </button>
            </div>
          ) : null}
        </>
      )}

      {catalogOpen ? (
        <OutsideOrderPicker
          supplierId={document.supplierId}
          onSelect={selectOutsideOrderProduct}
          onClose={() => setCatalogOpen(false)}
        />
      ) : null}
    </div>
  )
}
