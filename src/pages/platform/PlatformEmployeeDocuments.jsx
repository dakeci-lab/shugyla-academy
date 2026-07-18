import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../../context/ToastContext'
import { usePlatformPageTitle } from '../../context/PlatformPageTitleContext'
import {
  canManageEmployees,
  getEmployeeProfilePath,
} from '../../config/permissions'
import {
  EMPLOYEE_DOCUMENT_TYPES,
  formatDocumentUploadedAt,
} from '../../utils/employeeDocuments'
import {
  createEmployeeDocumentSignedUrl,
  listEmployeeDocuments,
  uploadEmployeeDocument,
} from '../../services/employeeDocumentService'
import { isCloudMode } from '../../lib/dataMode'
import './PlatformEmployeeDocuments.css'

function DocumentRow({
  type,
  document,
  canUpload,
  uploading,
  onUploadClick,
  onView,
}) {
  const uploaded = Boolean(document)
  return (
    <article className="employee-docs__row">
      <div className="employee-docs__row-main">
        <h2 className="employee-docs__row-title">{type.label}</h2>
        {uploaded ? (
          <p className="employee-docs__row-status employee-docs__row-status--ok">
            Загружено · {formatDocumentUploadedAt(document.createdAt)}
          </p>
        ) : (
          <p className="employee-docs__row-status">Документ ещё не загружен</p>
        )}
      </div>
      <div className="employee-docs__row-actions">
        {uploaded ? (
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => onView(document)}
          >
            Открыть
          </button>
        ) : canUpload ? (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={uploading}
            onClick={() => onUploadClick(type.id)}
          >
            {uploading ? 'Загрузка…' : 'Загрузить'}
          </button>
        ) : (
          <span className="employee-docs__row-empty">Нет файла</span>
        )}
      </div>
    </article>
  )
}

/** Страница документов сотрудника (свой профиль или карточка для админа) */
export default function PlatformEmployeeDocuments() {
  const { employeeId: employeeIdParam } = useParams()
  const { user } = useSession()
  const navigate = useNavigate()
  const { success: showSuccess, warning: showWarning } = useToast()
  const fileInputRef = useRef(null)
  const pendingTypeRef = useRef(null)

  const employeeId = Number(employeeIdParam)
  const isOwn = Number(user?.id) === employeeId
  const canAdminView = canManageEmployees(user)
  const canAccess = isOwn || canAdminView
  const canUpload = isOwn

  const backPath = isOwn
    ? '/platform/profile'
    : getEmployeeProfilePath(employeeId)

  usePlatformPageTitle('Документы сотрудника', '', {
    showBack: true,
    backFallback: backPath,
  })

  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploadingType, setUploadingType] = useState(null)

  const docsByType = useMemo(() => {
    const map = new Map()
    for (const doc of documents) {
      map.set(doc.documentType, doc)
    }
    return map
  }, [documents])

  const loadDocuments = useCallback(async () => {
    if (!canAccess || !Number.isFinite(employeeId)) return
    setLoading(true)
    setError('')
    try {
      if (!isCloudMode()) {
        setDocuments([])
        setError('Документы доступны только в облачном режиме')
        return
      }
      const rows = await listEmployeeDocuments(employeeId)
      setDocuments(rows)
    } catch (err) {
      setError(err?.message || 'Не удалось загрузить документы')
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }, [canAccess, employeeId])

  useEffect(() => {
    if (!canAccess) return
    void loadDocuments()
  }, [canAccess, loadDocuments])

  function handleUploadClick(typeId) {
    if (!canUpload || uploadingType) return
    pendingTypeRef.current = typeId
    fileInputRef.current?.click()
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    const typeId = pendingTypeRef.current
    event.target.value = ''
    pendingTypeRef.current = null
    if (!file || !typeId) return

    setUploadingType(typeId)
    try {
      const created = await uploadEmployeeDocument(employeeId, typeId, file)
      setDocuments((prev) => {
        const without = prev.filter((item) => item.documentType !== typeId)
        return [created, ...without]
      })
      showSuccess('Документ загружен')
    } catch (err) {
      showWarning(err?.message || 'Не удалось загрузить документ')
    } finally {
      setUploadingType(null)
    }
  }

  async function handleView(document) {
    try {
      const url = await createEmployeeDocumentSignedUrl(document.storagePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      showWarning(err?.message || 'Не удалось открыть документ')
    }
  }

  if (!Number.isFinite(employeeId) || !canAccess) {
    return (
      <div className="employee-docs">
        <p className="employee-docs__error">Нет доступа к документам</p>
        <button type="button" className="btn btn--outline" onClick={() => navigate(backPath)}>
          Назад
        </button>
      </div>
    )
  }

  return (
    <div className="employee-docs">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.heic,.heif"
        className="employee-docs__file-input"
        onChange={(event) => void handleFileChange(event)}
      />

      {loading ? (
        <div className="employee-docs__loading">Загрузка…</div>
      ) : error ? (
        <div className="employee-docs__error-block">
          <p className="employee-docs__error">{error}</p>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => void loadDocuments()}>
            Повторить
          </button>
        </div>
      ) : (
        <div className="employee-docs__list">
          {EMPLOYEE_DOCUMENT_TYPES.map((type) => (
            <DocumentRow
              key={type.id}
              type={type}
              document={docsByType.get(type.id) || null}
              canUpload={canUpload}
              uploading={uploadingType === type.id}
              onUploadClick={handleUploadClick}
              onView={handleView}
            />
          ))}
        </div>
      )}
    </div>
  )
}
