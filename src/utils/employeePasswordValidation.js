import {
  MIN_EMPLOYEE_TEMP_PASSWORD_LENGTH,
} from './edgeFunctionErrors'

export { MIN_EMPLOYEE_TEMP_PASSWORD_LENGTH }

export const EMPLOYEE_TEMP_PASSWORD_MIN_MESSAGE =
  'Пароль должен содержать минимум 6 символов'

export function validateEmployeeTemporaryPassword(password) {
  const trimmed = password?.trim() ?? ''
  if (trimmed.length < MIN_EMPLOYEE_TEMP_PASSWORD_LENGTH) {
    return EMPLOYEE_TEMP_PASSWORD_MIN_MESSAGE
  }
  return null
}
