import { getActiveEmployees } from './employeeData'

export function getOverviewStats() {
  return {
    totalEmployees: getActiveEmployees().length,
  }
}
