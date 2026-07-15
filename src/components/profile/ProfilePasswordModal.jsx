import AdminModal from '../admin/AdminModal'
import ProfileChangePasswordForm from '../ProfileChangePasswordForm'

/** Модальное окно смены пароля на странице профиля */
export default function ProfilePasswordModal({ open, onClose, userLogin, returnFocusRef }) {
  if (!open) return null

  return (
    <AdminModal title="Сменить пароль" onClose={onClose} returnFocusRef={returnFocusRef}>
      <ProfileChangePasswordForm userLogin={userLogin} variant="modal" onSuccess={onClose} />
    </AdminModal>
  )
}
