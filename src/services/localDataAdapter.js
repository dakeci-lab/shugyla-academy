import {
  getAllEmployeesLocal,
  addEmployee as localAddEmployee,
  updateEmployee as localUpdateEmployee,
  deactivateEmployee as localDeactivateEmployee,
  restoreEmployee as localRestoreEmployee,
  permanentlyDeleteEmployee as localPermanentlyDeleteEmployee,
  authenticateEmployee as localAuthenticateEmployee,
} from '../utils/employeeData'
import { normalizeEmployee } from '../utils/employeeData'

/** Collect employee data from localStorage for migration */
export function collectLocalSnapshot() {
  const employees = getAllEmployeesLocal()

  const users = employees.map((emp) => ({
    id: emp.id,
    first_name: emp.firstName,
    last_name: emp.lastName,
    full_name: emp.name,
    login: emp.login,
    password: emp.password || '',
    role: emp.role,
    position: emp.position || '',
    status: emp.employmentStatus || 'active',
  }))

  return {
    counts: {
      employees: employees.length,
    },
    users,
  }
}

export async function getEmployees() {
  return getAllEmployeesLocal()
}

export async function createEmployee(data) {
  return localAddEmployee(data)
}

export async function updateEmployee(id, updates) {
  localUpdateEmployee(id, updates)
}

export async function deactivateEmployee(id) {
  localDeactivateEmployee(id)
}

export async function restoreEmployee(id) {
  localRestoreEmployee(id)
}

export async function permanentlyDeleteEmployee(id) {
  localPermanentlyDeleteEmployee(id)
}

export async function updateProfileName(userId, fullName) {
  const trimmed = fullName.trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  const firstName = parts[0] || trimmed
  const lastName = parts.slice(1).join(' ')
  localUpdateEmployee(userId, {
    firstName,
    lastName,
    name: trimmed,
  })
}

export async function updateProfile(userId, { firstName, lastName, contactEmail }) {
  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()
  const fullName = `${trimmedFirst} ${trimmedLast}`.trim()
  localUpdateEmployee(userId, {
    firstName: trimmedFirst,
    lastName: trimmedLast,
    name: fullName,
    contactEmail: contactEmail?.trim() ? contactEmail.trim().toLowerCase() : '',
  })
}

export async function authenticateUser(loginValue, password) {
  return localAuthenticateEmployee(loginValue, password)
}

export async function initializeLocal() {
  const { getLocalStandardsBundle } = await import('./standardsLocalAdapter')
  const standardsBundle = getLocalStandardsBundle()
  const { getLocalRecruitmentBundle } = await import('./recruitmentLocalAdapter')
  const recruitmentBundle = getLocalRecruitmentBundle()
  const { getLocalSuppliersBundle } = await import('./suppliersLocalAdapter')
  const suppliersBundle = getLocalSuppliersBundle()
  return {
    employees: getAllEmployeesLocal(),
    standardCategories: standardsBundle.categories,
    standardArticles: standardsBundle.articles,
    standardArticleReads: standardsBundle.reads,
    vacancies: recruitmentBundle.vacancies,
    candidateQuestions: recruitmentBundle.questions,
    candidates: recruitmentBundle.candidates,
    suppliers: suppliersBundle.suppliers,
  }
}

export { normalizeEmployee }
