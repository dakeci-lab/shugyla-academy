import { useState } from 'react'
import {
  createPaymentAccount,
  setPaymentAccountActive,
  updatePaymentAccount,
} from '../../../services/paymentAccountsService'
import { findPaymentAccountNameConflict } from '../../../utils/paymentAccountsData'
import { useToast } from '../../../context/ToastContext'
import PaymentAccountEditorModal from './PaymentAccountEditorModal'

const EMPTY_FORM = { name: '', description: '', isActive: true }

export function usePaymentAccountEditor({ accounts, onSaved }) {
  const { success: toastSuccess, error: toastError } = useToast()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState('create')
  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function openCreate() {
    setEditorMode('create')
    setSelectedAccountId(null)
    setForm(EMPTY_FORM)
    setError('')
    setEditorOpen(true)
  }

  function openEdit(account) {
    setEditorMode('edit')
    setSelectedAccountId(account.id)
    setForm({ name: account.name, description: account.description || '', isActive: account.isActive })
    setError('')
    setEditorOpen(true)
  }

  async function handleSave(e) {
    e?.preventDefault?.()
    const name = form.name.trim()
    if (!name) {
      setError('Укажите название счёта')
      return
    }
    const conflict = findPaymentAccountNameConflict(accounts, name, {
      exceptId: editorMode === 'edit' ? selectedAccountId : null,
    })
    if (conflict) {
      setError(`Счёт «${conflict.name}» уже существует`)
      return
    }

    setSaving(true)
    setError('')
    try {
      if (editorMode === 'create') {
        await createPaymentAccount({ name, description: form.description.trim() })
      } else {
        await updatePaymentAccount(selectedAccountId, {
          name,
          description: form.description.trim(),
        })
        if (form.isActive !== accounts.find((a) => a.id === selectedAccountId)?.isActive) {
          await setPaymentAccountActive(selectedAccountId, form.isActive)
        }
      }
      await onSaved?.()
      setEditorOpen(false)
      toastSuccess('Счёт оплаты сохранён')
    } catch (err) {
      setError(err.message || 'Не удалось сохранить счёт')
      toastError(err.message || 'Не удалось сохранить счёт')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(account) {
    try {
      await setPaymentAccountActive(account.id, false)
      await onSaved?.()
      toastSuccess(`Счёт «${account.name}» деактивирован`)
    } catch (err) {
      toastError(err.message || 'Не удалось деактивировать счёт')
    }
  }

  async function handleActivate(account) {
    try {
      await setPaymentAccountActive(account.id, true)
      await onSaved?.()
      toastSuccess(`Счёт «${account.name}» активирован`)
    } catch (err) {
      toastError(err.message || 'Не удалось активировать счёт')
    }
  }

  const editorModal = (
    <PaymentAccountEditorModal
      open={editorOpen}
      mode={editorMode}
      form={form}
      setForm={setForm}
      onSave={handleSave}
      onClose={() => setEditorOpen(false)}
      saving={saving}
      error={error}
    />
  )

  return { editorModal, openCreate, openEdit, handleDeactivate, handleActivate }
}
