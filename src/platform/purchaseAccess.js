import { ROLE_IDS } from '../data/roles'
import { canManageAdmin } from '../utils/auth'
import { ROLE_RECEIVER } from './supplierAccess'

/** Просмотр раздела «Закуп» */
export function canViewPurchases(user) {
  if (!user?.role) return false
  if (canManageAdmin(user.role)) return true
  return user.role === ROLE_IDS.BUYER
}

/** Редактирование закупов */
export function canEditPurchases(user) {
  return canCreatePurchase(user)
}

/** Создание новых закупов */
export function canCreatePurchase(user) {
  if (!user?.role) return false
  if (canManageAdmin(user.role)) return true
  return user.role === ROLE_IDS.BUYER
}

/** Передача закупа в приёмку */
export function canTransferToReceiving(user) {
  return canCreatePurchase(user)
}

/** Приёмщик видит только документы, переданные в приёмку (модуль Приёмка) */
export function canViewReceivingDocuments(user) {
  if (!user?.role) return false
  if (canManageAdmin(user.role)) return true
  return user.role === ROLE_IDS.BUYER || user.role === ROLE_RECEIVER
}

/** @deprecated используйте canViewReceivingDocuments */
export function receiverSeesTransferredOnly() {
  return true
}
