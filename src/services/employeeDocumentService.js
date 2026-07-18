import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import { getEmployeeDocumentType } from '../utils/employeeDocuments'

export const EMPLOYEE_DOCUMENT_BUCKET = 'employee-documents'
export const MAX_EMPLOYEE_DOCUMENT_BYTES = 10 * 1024 * 1024

const DOCUMENT_SELECT =
  'id, employee_id, document_type, storage_path, file_name, content_type, created_at, updated_at'

function assertCloudReady() {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    throw new Error('Загрузка документов доступна только в облачном режиме')
  }
}

function safeFileName(name) {
  const base = String(name || 'document')
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
  return base || 'document'
}

export function validateEmployeeDocumentFile(file, typeId) {
  if (!file) return 'Выберите файл'
  const typeMeta = getEmployeeDocumentType(typeId)
  if (!typeMeta) return 'Неизвестный тип документа'

  const mime = String(file.type || '').toLowerCase()
  const allowed =
    mime.startsWith('image/') ||
    mime === 'application/pdf' ||
    /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name || '')

  if (!allowed) {
    return 'Допустимы изображения и PDF'
  }
  if (file.size > MAX_EMPLOYEE_DOCUMENT_BYTES) {
    return 'Размер файла не должен превышать 10 МБ'
  }
  return null
}

export function buildEmployeeDocumentPath(employeeId, documentType, fileName) {
  const stamp = Date.now()
  return `${employeeId}/${documentType}/${stamp}-${safeFileName(fileName)}`
}

export function normalizeEmployeeDocument(row) {
  if (!row) return null
  return {
    id: row.id,
    employeeId: Number(row.employee_id),
    documentType: row.document_type,
    storagePath: row.storage_path,
    fileName: row.file_name ?? null,
    contentType: row.content_type ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listEmployeeDocuments(employeeId) {
  assertCloudReady()
  const id = Number(employeeId)
  if (!Number.isFinite(id)) throw new Error('Некорректный сотрудник')

  const { data, error } = await supabase
    .from('employee_documents')
    .select(DOCUMENT_SELECT)
    .eq('employee_id', id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Не удалось загрузить документы')
  return (data ?? []).map(normalizeEmployeeDocument).filter(Boolean)
}

export async function getEmployeeDocumentByType(employeeId, documentType) {
  assertCloudReady()
  const id = Number(employeeId)
  const { data, error } = await supabase
    .from('employee_documents')
    .select(DOCUMENT_SELECT)
    .eq('employee_id', id)
    .eq('document_type', documentType)
    .maybeSingle()

  if (error) throw new Error(error.message || 'Не удалось загрузить документ')
  return normalizeEmployeeDocument(data)
}

export async function createEmployeeDocumentSignedUrl(storagePath, expiresIn = 3600) {
  assertCloudReady()
  if (!storagePath) throw new Error('Файл не найден')

  const { data, error } = await supabase.storage
    .from(EMPLOYEE_DOCUMENT_BUCKET)
    .createSignedUrl(storagePath, expiresIn)

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Не удалось открыть документ')
  }
  return data.signedUrl
}

/**
 * Загрузка документа сотрудником для себя.
 * Один файл на тип: повторная загрузка запрещена (удаление/замена — позже).
 */
export async function uploadEmployeeDocument(employeeId, documentType, file) {
  assertCloudReady()
  const id = Number(employeeId)
  if (!Number.isFinite(id)) throw new Error('Некорректный сотрудник')

  const validationError = validateEmployeeDocumentFile(file, documentType)
  if (validationError) throw new Error(validationError)

  const existing = await getEmployeeDocumentByType(id, documentType)
  if (existing) {
    throw new Error('Документ уже загружен')
  }

  const path = buildEmployeeDocumentPath(id, documentType, file.name)
  const contentType = file.type || 'application/octet-stream'

  const { error: uploadError } = await supabase.storage
    .from(EMPLOYEE_DOCUMENT_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType,
    })

  if (uploadError) {
    throw new Error(uploadError.message || 'Не удалось загрузить файл')
  }

  const { data, error } = await supabase
    .from('employee_documents')
    .insert({
      employee_id: id,
      document_type: documentType,
      storage_path: path,
      file_name: file.name || null,
      content_type: contentType,
    })
    .select(DOCUMENT_SELECT)
    .single()

  if (error) {
    // Best-effort cleanup of orphaned storage object
    await supabase.storage.from(EMPLOYEE_DOCUMENT_BUCKET).remove([path])
    throw new Error(error.message || 'Не удалось сохранить документ')
  }

  return normalizeEmployeeDocument(data)
}
