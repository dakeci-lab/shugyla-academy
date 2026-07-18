/** Каталог типов документов сотрудника — расширяемый. */

export const EMPLOYEE_DOCUMENT_TYPES = [
  {
    id: 'identity_card',
    label: 'Удостоверение личности',
    accept: 'image/*,application/pdf,.heic,.heif',
  },
  // Future:
  // { id: 'military_id', label: 'Военный билет', accept: 'image/*,application/pdf' },
  // { id: 'diploma', label: 'Диплом', accept: 'image/*,application/pdf' },
]

export function getEmployeeDocumentType(typeId) {
  return EMPLOYEE_DOCUMENT_TYPES.find((item) => item.id === typeId) || null
}

export function formatDocumentUploadedAt(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function getEmployeeDocumentsPath(employeeId) {
  return `/platform/employees/${employeeId}/documents`
}
