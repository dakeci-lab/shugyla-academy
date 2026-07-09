import { ROLE_IDS } from '../data/roles'
import { canManageAdmin } from '../utils/auth'

/** Роль приёмщика (зарезервировано до добавления в roles.js) */
export const ROLE_RECEIVER = 'receiver'

/** Просмотр списка и карточки поставщиков */
export function canViewSuppliers(user) {
  if (!user?.role) return false
  if (canManageAdmin(user.role)) return true
  return user.role === ROLE_IDS.BUYER || user.role === ROLE_RECEIVER
}

/** Создание и редактирование поставщиков */
export function canEditSuppliers(user) {
  if (!user?.role) return false
  if (canManageAdmin(user.role)) return true
  return user.role === ROLE_IDS.BUYER
}

/** Архивирование поставщиков */
export function canArchiveSuppliers(user) {
  return canEditSuppliers(user)
}

/** Удаление поставщиков — только admin и закупщик */
export function canDeleteSuppliers(user) {
  return canEditSuppliers(user)
}
