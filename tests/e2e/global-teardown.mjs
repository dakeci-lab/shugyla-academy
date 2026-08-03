import { cleanupE2eFixture, loadState } from './helpers/fixture.mjs'
import { resolveServiceRoleKey } from './helpers/env.mjs'

export default async function globalTeardown() {
  resolveServiceRoleKey()
  const state = loadState()
  const report = await cleanupE2eFixture(state)
  console.log(
    `E2E cleanup: vacancies=${report.vacanciesDeleted} candidates=${report.candidatesDeleted} uploads=${report.uploadsDeleted} storage=${report.storageDeleted} auth=${report.authDeleted} role=${report.roleDeleted} leftovers=${JSON.stringify(report.leftovers || {})}`
  )
  if (report.errors?.length) {
    throw new Error(`E2E cleanup storage/entity errors: ${report.errors.join(' | ')}`)
  }
  const leftovers = report.leftovers || {}
  if (
    leftovers.vacancies > 0 ||
    leftovers.candidates > 0 ||
    leftovers.users > 0 ||
    leftovers.roles > 0 ||
    leftovers.global > 0 ||
    report.ok === false
  ) {
    throw new Error(`E2E cleanup incomplete: ${JSON.stringify(leftovers)}`)
  }
}
