import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { loadReceivingDocumentById } from '../../../services/receivingDataService'

/**
 * Old links /platform/receiving/:id lead to the order the document was created
 * from (the «Приёмка» section was merged into «Заказы» on 2026-09-20).
 */
export default function ReceivingDocumentRedirect() {
  const { id } = useParams()
  const [target, setTarget] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadReceivingDocumentById(id)
      .then((doc) => {
        if (!cancelled) setTarget(doc?.purchaseOrderId ? `/platform/orders/${doc.purchaseOrderId}` : '/platform/orders')
      })
      .catch(() => {
        if (!cancelled) setTarget('/platform/orders')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return target ? <Navigate to={target} replace /> : null
}
