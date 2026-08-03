import { useEffect, useState } from 'react'
import AdminModal from './AdminModal'
import { getApplyHubUrl } from '../../utils/recruitmentData'
import { toastSuccess } from '../../services/notificationService'
import './admin-shared.css'

const QR_PIXEL_SIZE = 1024
const QR_MARGIN = 4

async function buildQrDataUrl(url) {
  const QRCode = (await import('qrcode')).default
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: QR_MARGIN,
    width: QR_PIXEL_SIZE,
    color: {
      dark: '#111827',
      light: '#ffffff',
    },
  })
}

/** QR modal for the permanent store apply hub URL */
export default function ApplyHubQrModal({ onClose }) {
  const hubUrl = getApplyHubUrl('?source=store_qr')
  const [dataUrl, setDataUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    buildQrDataUrl(hubUrl)
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Не удалось создать QR-код')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [hubUrl])

  async function handleCopy() {
    try {
      await navigator.clipboard?.writeText(hubUrl)
      toastSuccess('Ссылка скопирована')
    } catch {
      toastSuccess(hubUrl)
    }
  }

  function handleDownload() {
    if (!dataUrl) return
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = 'shugyla-apply-qr.png'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  function handlePrint() {
    if (!dataUrl) return
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900')
    if (!popup) return
    popup.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>QR — Работа в Shugyla</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 24px; color: #111; }
    img { width: min(70vw, 420px); height: auto; }
    p { max-width: 420px; margin: 12px auto; word-break: break-all; }
  </style>
</head>
<body>
  <h1>Работа в Shugyla</h1>
  <img src="${dataUrl}" alt="QR-код страницы вакансий" />
  <p>${hubUrl}</p>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`)
    popup.document.close()
  }

  return (
    <AdminModal
      title="Общий QR-код"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="btn btn--outline" onClick={handleCopy}>
            Копировать ссылку
          </button>
          <button
            type="button"
            className="btn btn--outline"
            onClick={handleDownload}
            disabled={!dataUrl}
          >
            Скачать PNG
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handlePrint}
            disabled={!dataUrl}
          >
            Печать
          </button>
        </>
      }
    >
      <div className="admin-form" style={{ textAlign: 'center' }}>
        <p className="admin-form__hint" style={{ marginBottom: '1rem' }}>
          Этот QR-код ведёт на общий список открытых вакансий. Его можно разместить у входа в
          магазин.
        </p>

        {loading && <p>Создание QR-кода…</p>}
        {error && <p className="admin-form__error">{error}</p>}
        {dataUrl && (
          <img
            src={dataUrl}
            alt="QR-код общей страницы вакансий"
            width={280}
            height={280}
            style={{
              width: 'min(100%, 280px)',
              height: 'auto',
              background: '#fff',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid var(--color-border, #e5e7eb)',
            }}
          />
        )}

        <p
          className="admin-code"
          style={{
            marginTop: '1rem',
            wordBreak: 'break-all',
            display: 'inline-block',
            maxWidth: '100%',
          }}
        >
          {hubUrl}
        </p>
      </div>
    </AdminModal>
  )
}
