import { useRef, useState } from 'react'
import AdminModal from '../admin/AdminModal'
import './UmagImportModal.css'

const EXPECTED_COLUMNS = [
  'Товар',
  'Штрихкод',
  'Поставщик',
  'Остаток',
  'Продажи за период',
  'Закупочная цена',
]

/** Модальное окно импорта из Umag (каркас без парсинга) */
export default function UmagImportModal({ onClose, onUploaded }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  function pickFile(nextFile) {
    if (!nextFile) return
    const ext = nextFile.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setMessage('Поддерживаются файлы Excel (.xlsx, .xls) и CSV.')
      return
    }
    setFile(nextFile)
    setMessage('')
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    pickFile(e.dataTransfer.files?.[0])
  }

  async function handleUpload() {
    if (!file) {
      setMessage('Выберите файл для загрузки.')
      return
    }
    setUploading(true)
    setMessage('')
    await new Promise((r) => setTimeout(r, 600))
    setUploading(false)
    setMessage('Файл принят. Анализ остатков и продаж будет доступен после подключения логики.')
    onUploaded?.(file)
  }

  return (
    <AdminModal
      title="Импорт из Umag"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={uploading || !file}
            onClick={handleUpload}
          >
            {uploading ? 'Загрузка…' : 'Загрузить'}
          </button>
        </>
      }
    >
      <p className="umag-import__intro">
        Загрузите файл остатков и продаж из Umag
      </p>

      <div
        className={`umag-import__dropzone ${dragOver ? 'umag-import__dropzone--active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="umag-import__input"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        {file ? (
          <>
            <span className="umag-import__file-name">{file.name}</span>
            <span className="umag-import__hint">Нажмите, чтобы выбрать другой файл</span>
          </>
        ) : (
          <>
            <span className="umag-import__label">Перетащите Excel-файл сюда</span>
            <span className="umag-import__hint">или нажмите для выбора</span>
          </>
        )}
      </div>

      <div className="umag-import__columns">
        <p className="umag-import__columns-title">Ожидаемые колонки в файле:</p>
        <ul>
          {EXPECTED_COLUMNS.map((col) => (
            <li key={col}>{col}</li>
          ))}
        </ul>
      </div>

      {message && <p className="umag-import__message">{message}</p>}
    </AdminModal>
  )
}
