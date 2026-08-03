import { cleanupE2eFixture, loadState } from './helpers/fixture.mjs'
import { resolveServiceRoleKey } from './helpers/env.mjs'

export default async function globalTeardown() {
  resolveServiceRoleKey()
  const state = loadState()
  const report = await cleanupE2eFixture(state)
  console.log(
    `E2E cleanup: vacancies=${report.vacanciesDeleted} candidates=${report.candidatesDeleted} uploads=${report.uploadsDeleted} storage=${report.storageDeleted} auth=${report.authDeleted} role=${report.roleDeleted} leftovers=${JSON.stringify(report.leftovers || {})}`
  )
  const reuse = Boolean(state?.reuseAccount)
  if (report.leftovers?.vacancies > 0 || (!reuse && report.leftovers?.users > 0)) {
    throw new Error(`E2E cleanup incomplete: ${JSON.stringify(report.leftovers)}`)
  }
}
