import { useCallback, useRef, useState } from 'react'
import useMediaQuery from '../../../hooks/useMediaQuery'
import { isPwaStandalone } from '../../../utils/pwaStandalone'
import PriceCheckerForm from '../../../components/products/price-checker/PriceCheckerForm'
import PriceCheckerResult from '../../../components/products/price-checker/PriceCheckerResult'
import PriceCheckerHistory from '../../../components/products/price-checker/PriceCheckerHistory'
import {
  PRICE_CHECKER_ERROR_CODES,
  checkPriceByBarcode,
  isValidBarcode,
  normalizeBarcodeInput,
} from '../../../services/umagPriceCheckerService'
import '../../../components/admin/admin-shared.css'
import './PriceCheckerPage.css'

const DESKTOP_QUERY = '(min-width: 901px)'
const HISTORY_LIMIT = 10

function newHistoryId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `pc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Admin WEB-only UMAG barcode price lookup prototype. */
export default function PriceCheckerPage() {
  const isDesktopViewport = useMediaQuery(DESKTOP_QUERY)
  const pwaStandalone = isPwaStandalone()
  const webOnlyBlocked = !isDesktopViewport || pwaStandalone

  const [barcode, setBarcode] = useState('')
  const [status, setStatus] = useState('idle')
  const [product, setProduct] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [history, setHistory] = useState([])
  const inFlightRef = useRef(false)
  const lastSubmittedRef = useRef('')

  const pushHistory = useCallback((entry) => {
    setHistory((prev) => [{ id: newHistoryId(), at: new Date().toISOString(), ...entry }, ...prev].slice(0, HISTORY_LIMIT))
  }, [])

  const handleSubmit = useCallback(
    async (rawBarcode) => {
      const normalized = normalizeBarcodeInput(rawBarcode)
      if (!normalized || !isValidBarcode(normalized)) {
        setStatus('error')
        setProduct(null)
        setFetchedAt(null)
        setErrorMessage('Введите корректный штрих-код')
        return
      }
      if (inFlightRef.current) return
      if (lastSubmittedRef.current === normalized && status === 'loading') return

      inFlightRef.current = true
      lastSubmittedRef.current = normalized
      setStatus('loading')
      setProduct(null)
      setFetchedAt(null)
      setErrorMessage('')
      setBarcode(normalized)

      const result = await checkPriceByBarcode(normalized)
      inFlightRef.current = false

      if (result.success) {
        setStatus('found')
        setProduct(result.product)
        setFetchedAt(result.fetchedAt)
        pushHistory({
          barcode: result.product.barcode,
          name: result.product.name,
          sellingPrice: result.product.sellingPrice,
          status: 'found',
        })
        return
      }

      if (result.code === PRICE_CHECKER_ERROR_CODES.NOT_FOUND) {
        setStatus('not_found')
        setErrorMessage(result.message)
        pushHistory({
          barcode: normalized,
          name: '',
          sellingPrice: null,
          status: 'not_found',
        })
        return
      }

      setStatus('error')
      setErrorMessage(result.message)
      pushHistory({
        barcode: normalized,
        name: '',
        sellingPrice: null,
        status: 'error',
      })
    },
    [pushHistory, status]
  )

  function handleClear() {
    setBarcode('')
    setStatus('idle')
    setProduct(null)
    setFetchedAt(null)
    setErrorMessage('')
    lastSubmittedRef.current = ''
  }

  if (webOnlyBlocked) {
    return (
      <div className="price-checker-page price-checker-page--blocked">
        <div className="price-checker-page__blocked-card">
          <h1 className="price-checker-page__blocked-title">
            Прайс-чекер доступен только в веб-версии
          </h1>
          <p className="price-checker-page__blocked-text">
            Откройте Shugyla Platform на компьютере, чтобы воспользоваться этим модулем.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="price-checker-page">
      <header className="price-checker-page__header">
        <h1 className="price-checker-page__title">Прайс-чекер</h1>
        <p className="price-checker-page__subtitle">
          Проверка актуальной цены товара по штрих-коду
        </p>
      </header>

      <section className="price-checker-page__card" aria-label="Проверка цены">
        <PriceCheckerForm
          value={barcode}
          onChange={setBarcode}
          onSubmit={handleSubmit}
          onClear={handleClear}
          loading={status === 'loading'}
        />
        <PriceCheckerResult
          status={status}
          product={product}
          fetchedAt={fetchedAt}
          errorMessage={errorMessage}
        />
      </section>

      <PriceCheckerHistory items={history} />
    </div>
  )
}
