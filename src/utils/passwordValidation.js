/** Валидация формы смены пароля */

export function validatePasswordChangeForm({ currentPassword, newPassword, confirmPassword }) {
  const errors = {}

  if (!currentPassword?.trim()) {
    errors.currentPassword = 'Введите текущий пароль'
  }

  if (!newPassword) {
    errors.newPassword = 'Новый пароль должен содержать не менее 8 символов'
  } else if (newPassword.length < 8) {
    errors.newPassword = 'Новый пароль должен содержать не менее 8 символов'
  } else if (!/[a-zA-Zа-яА-ЯёЁ]/.test(newPassword) || !/\d/.test(newPassword)) {
    errors.newPassword = 'Новый пароль должен содержать хотя бы одну букву и одну цифру'
  } else if (currentPassword && newPassword === currentPassword) {
    errors.newPassword = 'Новый пароль не должен совпадать с текущим'
  }

  if (newPassword !== confirmPassword) {
    errors.confirmPassword = 'Новые пароли не совпадают'
  }

  return errors
}
