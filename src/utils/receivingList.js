export const RECEIVING_LIST_STATUS = {
  ALL: 'all',
  OPEN: 'open',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
}

export function getReceivingDocumentDateKey(document) {
  const value = document?.expectedDeliveryDate ?? document?.expected_delivery_date ?? ''
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] || ''
}

export function matchesReceivingStatus(document, statusFilter) {
  if (!statusFilter || statusFilter === RECEIVING_LIST_STATUS.ALL) return true

  const status = document?.status
  if (statusFilter === RECEIVING_LIST_STATUS.RECEIVED) {
    return status === 'received'
  }
  if (statusFilter === RECEIVING_LIST_STATUS.CANCELLED) {
    return status === 'cancelled'
  }

  return status !== 'received' && status !== 'cancelled'
}

export function filterReceivingDocuments(
  documents,
  { dateKey = '', status = RECEIVING_LIST_STATUS.ALL, supplierQuery = '' } = {}
) {
  const normalizedQuery = String(supplierQuery).trim().toLocaleLowerCase('ru')

  return (documents || [])
    .filter((document) => !dateKey || getReceivingDocumentDateKey(document) === dateKey)
    .filter((document) => matchesReceivingStatus(document, status))
    .filter((document) => {
      if (!normalizedQuery) return true
      return String(document?.supplierName || '')
        .toLocaleLowerCase('ru')
        .includes(normalizedQuery)
    })
    .slice()
    .sort((a, b) => {
      const dateCompare = getReceivingDocumentDateKey(a).localeCompare(
        getReceivingDocumentDateKey(b)
      )
      if (dateCompare !== 0) return dateCompare
      return String(a?.supplierName || '').localeCompare(String(b?.supplierName || ''), 'ru')
    })
}

export function countReceivingDocumentsByDate(documents) {
  return (documents || []).reduce((counts, document) => {
    const dateKey = getReceivingDocumentDateKey(document)
    if (dateKey) counts[dateKey] = (counts[dateKey] || 0) + 1
    return counts
  }, {})
}
