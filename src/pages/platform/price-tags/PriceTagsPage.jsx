import { useEffect, useMemo, useState } from 'react'
import useMediaQuery from '../../../hooks/useMediaQuery'
import { isPwaStandalone } from '../../../utils/pwaStandalone'
import PriceTagPreview from '../../../components/priceTags/PriceTagPreview'
import PriceTagRowsEditor from '../../../components/priceTags/PriceTagRowsEditor'
import {
  PRICE_TAG_SIZES,
  PRICE_TAG_TYPE_OPTIONS,
  DEFAULT_PRICE_TAG_SIZE_ID,
  createEmptyPriceTagList,
  createEmptyPriceTagRow,
  normalizePriceTagRow,
  normalizePriceTagUnit,
  validatePriceTagList,
  buildPrintViewModelsFromList,
  movePriceTagRow,
  insertPriceTagRowsAfter,
  countPrintableTags,
} from '../../../utils/priceTags/priceTagModel'
import {
  loadPriceTagList,
  savePriceTagList,
  clearPriceTagListStorage,
} from '../../../utils/priceTags/priceTagListStorage'
import { printPriceTags } from '../../../utils/priceTags/priceTagPrint'
import { useToast } from '../../../context/ToastContext'
import '../../../components/admin/admin-shared.css'
import '../../../components/admin/AdminModal.css'
import './PriceTagsPage.css'

const DESKTOP_QUERY = '(min-width: 901px)'

function parseQty(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(999, Math.floor(n))
}

/** Manual price-tag list editor + print (WEB-first, responsive). */
export default function PriceTagsPage() {
  const { success: showSuccess, warning: showWarning, error: showError } = useToast()
  const isDesktopViewport = useMediaQuery(DESKTOP_QUERY)
  const pwaStandalone = isPwaStandalone()
  const printBlocked = pwaStandalone || !isDesktopViewport

  const [list, setList] = useState(() => loadPriceTagList())
  const [selectedRowId, setSelectedRowId] = useState(() => list.rows[0]?.id || null)
  const [errorsByRowId, setErrorsByRowId] = useState({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!list.rows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(list.rows[0]?.id || null)
    }
  }, [list.rows, selectedRowId])

  const selectedRow = useMemo(
    () => list.rows.find((row) => row.id === selectedRowId) || list.rows[0] || createEmptyPriceTagRow(),
    [list.rows, selectedRowId]
  )

  const printableCount = useMemo(() => countPrintableTags(list), [list])

  function patchList(updater) {
    setList((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      return { ...next, updatedAt: new Date().toISOString() }
    })
    setDirty(true)
  }

  function handleChangeRow(rowId, patch) {
    patchList((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => {
        if (row.id !== rowId) return row
        const next = { ...row, ...patch }
        if (patch.unit != null) next.unit = normalizePriceTagUnit(patch.unit)
        if (patch.quantity != null) next.quantity = parseQty(patch.quantity)
        if (patch.showDescription === false) {
          // keep description text for re-enable; only hide
        }
        return next
      }),
    }))
    if (errorsByRowId[rowId]) {
      setErrorsByRowId((prev) => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
    }
  }

  function handleRemoveRow(rowId) {
    patchList((prev) => {
      if (prev.rows.length <= 1) {
        return { ...prev, rows: [createEmptyPriceTagRow()] }
      }
      return { ...prev, rows: prev.rows.filter((row) => row.id !== rowId) }
    })
  }

  function handleAddRow() {
    patchList((prev) => ({
      ...prev,
      rows: [...prev.rows, createEmptyPriceTagRow()],
    }))
  }

  function handleAddRows(count) {
    const n = Math.max(1, Number(count) || 1)
    patchList((prev) => ({
      ...prev,
      rows: [
        ...prev.rows,
        ...Array.from({ length: n }, () => createEmptyPriceTagRow()),
      ],
    }))
  }

  function handleInsertAfter(index) {
    patchList((prev) => ({
      ...prev,
      rows: insertPriceTagRowsAfter(prev.rows, index, 1),
    }))
  }

  function handleMoveRow(fromIndex, toIndex) {
    patchList((prev) => ({
      ...prev,
      rows: movePriceTagRow(prev.rows, fromIndex, toIndex),
    }))
  }

  function handleSave() {
    const ok = savePriceTagList(list)
    if (!ok) {
      showError('Не удалось сохранить список')
      return
    }
    setDirty(false)
    showSuccess('Список сохранён')
  }

  function handleReload() {
    const loaded = loadPriceTagList()
    setList(loaded)
    setSelectedRowId(loaded.rows[0]?.id || null)
    setErrorsByRowId({})
    setDirty(false)
    showSuccess('Список загружен')
  }

  function handleClear() {
    clearPriceTagListStorage()
    const fresh = createEmptyPriceTagList()
    setList(fresh)
    setSelectedRowId(fresh.rows[0]?.id || null)
    setErrorsByRowId({})
    setDirty(false)
  }

  function handlePrint() {
    if (printBlocked) {
      showWarning('Печать доступна в WEB-версии на компьютере')
      return
    }

    const validation = validatePriceTagList(list)
    if (validation.empty) {
      showWarning('Добавьте хотя бы один товар с названием и ценой')
      return
    }
    if (!validation.ok) {
      setErrorsByRowId(validation.errorsByRowId)
      if (validation.firstErrorRowId) setSelectedRowId(validation.firstErrorRowId)
      showWarning('Исправьте ошибки в строках перед печатью')
      return
    }

    const built = buildPrintViewModelsFromList(list)
    if (!built.ok || !built.viewModels.length) {
      showWarning('Нет строк для печати')
      return
    }

    const result = printPriceTags(built.viewModels)
    if (!result.ok) {
      showError(result.error)
      return
    }
    savePriceTagList(list)
    setDirty(false)
  }

  // Future import hook: map catalog/CSV rows into normalizePriceTagRow and append.
  function handleImportStub() {
    showWarning('Импорт товаров появится после подключения товарной базы')
  }

  return (
    <div className="price-tags-page">
      <header className="price-tags-page__header">
        <div className="price-tags-page__header-main">
          <h1 className="price-tags-page__title">Печать ценников</h1>
          <p className="price-tags-page__subtitle">
            Быстрый список для печати. Объём указывайте в названии — например «Молоко
            Айналайын 900 мл».
          </p>
        </div>
        <div className="price-tags-page__header-meta">
          <span className="price-tags-page__badge">
            {list.rows.length} стр. · ~{printableCount} ценников
          </span>
          {dirty ? <span className="price-tags-page__badge price-tags-page__badge--warn">Не сохранено</span> : null}
        </div>
      </header>

      <section className="price-tags-page__controls" aria-label="Параметры печати">
        <label className="price-tags-page__control">
          <span className="price-tags-page__control-label">Название списка</span>
          <input
            className="pt-rows__input"
            value={list.title}
            onChange={(e) => patchList((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Список ценников"
            autoComplete="off"
          />
        </label>

        <div className="price-tags-page__control">
          <span className="price-tags-page__control-label">Тип</span>
          <div className="price-tags-page__chips" role="radiogroup" aria-label="Тип ценника">
            {PRICE_TAG_TYPE_OPTIONS.map((option) => (
              <label
                key={option.id}
                className={`price-tags-page__chip${list.type === option.id ? ' price-tags-page__chip--active' : ''}`}
              >
                <input
                  type="radio"
                  name="price-tag-type"
                  value={option.id}
                  checked={list.type === option.id}
                  onChange={() => patchList((prev) => ({ ...prev, type: option.id }))}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <label className="price-tags-page__control">
          <span className="price-tags-page__control-label">Размер</span>
          <select
            className="pt-rows__select price-tags-page__size-select"
            value={list.sizeId || DEFAULT_PRICE_TAG_SIZE_ID}
            onChange={(e) => patchList((prev) => ({ ...prev, sizeId: e.target.value }))}
          >
            {PRICE_TAG_SIZES.map((size) => (
              <option key={size.id} value={size.id}>
                {size.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="price-tags-page__layout">
        <section className="price-tags-page__editor" aria-label="Список товаров">
          <PriceTagRowsEditor
            rows={list.rows}
            errorsByRowId={errorsByRowId}
            selectedRowId={selectedRowId}
            onSelectRow={setSelectedRowId}
            onChangeRow={handleChangeRow}
            onRemoveRow={handleRemoveRow}
            onAddRow={handleAddRow}
            onAddRows={handleAddRows}
            onInsertAfter={handleInsertAfter}
            onMoveRow={handleMoveRow}
          />
        </section>

        <aside className="price-tags-page__preview-panel" aria-label="Предпросмотр">
          <h2 className="price-tags-page__block-title">Предпросмотр</h2>
          <p className="price-tags-page__preview-hint">Выбранная строка</p>
          <PriceTagPreview
            draft={normalizePriceTagRow(selectedRow)}
            type={list.type}
            sizeId={list.sizeId}
          />
        </aside>
      </div>

      <footer className="price-tags-page__actions">
        <div className="price-tags-page__actions-left">
          <button type="button" className="btn btn--outline" onClick={handleClear}>
            Очистить
          </button>
          <button type="button" className="btn btn--outline" onClick={handleImportStub}>
            Импорт
          </button>
        </div>
        <div className="price-tags-page__actions-right">
          <button type="button" className="btn btn--outline" onClick={handleReload}>
            Загрузить
          </button>
          <button type="button" className="btn btn--outline" onClick={handleSave}>
            Сохранить
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handlePrint}
            disabled={printBlocked}
            title={printBlocked ? 'Печать только в WEB на компьютере' : undefined}
          >
            Печать
          </button>
        </div>
      </footer>
    </div>
  )
}
