#!/usr/bin/env node
/**
 * Verification: recruitment candidate duplicate-prevention redesign
 * (person identity + KZ phone normalization + idempotent submit + HR grouping).
 *
 * Pure-logic checks import and run the real helpers. The local adapter
 * (localStorage-backed) and the SQL migration/UI are asserted on source text.
 *
 * Usage:
 *   npm run verify:recruitment-candidate-dedupe
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// App sources are written for Vite: extensionless imports, JSON imports and
// import.meta.env. Empty env keeps the app in local mode — no Supabase, no network.
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const MIGRATION = 'supabase/migrations/20260812161033_recruitment_candidate_people_idempotency.sql'

let checks = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  if (!condition) fail(`${name}${detail ? ` — ${detail}` : ''}`)
  checks += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) fail(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}

async function load(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href)
}

// ---------------------------------------------------------------------------
// Stage 1 — KZ mobile phone normalization + paste handling (real import)
// ---------------------------------------------------------------------------

async function stagePhoneNormalization() {
  console.log('Stage 1: KZ phone normalization (real import)')
  const { normalizeKzMobilePhone, extractKzPhoneTail } = await load('src/utils/kzPhone.js')

  assert('+7-prefixed with spaces canonicalizes', normalizeKzMobilePhone('+7 701 234 56 78') === '+77012345678')
  assert('legacy 8-prefixed canonicalizes', normalizeKzMobilePhone('8 701 234 56 78') === '+77012345678')
  assert('bare 11-digit (77...) canonicalizes', normalizeKzMobilePhone('77012345678') === '+77012345678')
  assert('bare national 10-digit canonicalizes', normalizeKzMobilePhone('7012345678') === '+77012345678')
  assert('punctuation/parentheses stripped', normalizeKzMobilePhone('+7 (701) 234-56-78') === '+77012345678')
  assert('too few digits rejected', normalizeKzMobilePhone('+7 701 234 5') === null)
  assert('too many digits rejected', normalizeKzMobilePhone('+7 701 234 56 789') === null)
  assert('empty input rejected', normalizeKzMobilePhone('') === null)
  assert('non-numeric garbage rejected', normalizeKzMobilePhone('not a phone') === null)
  assert('null input rejected', normalizeKzMobilePhone(null) === null)

  // Paste handling: a full "8 7XX XXX XX XX" must strip exactly the 2-digit
  // (legacy-8 -> country+mobile-prefix) boundary, not just 1 char.
  assert(
    'pasting "87012345678" leaves the correct 9-digit tail',
    extractKzPhoneTail('87012345678') === '012345678'
  )
  assert(
    'pasting "+77012345678" leaves the correct 9-digit tail',
    extractKzPhoneTail('+77012345678') === '012345678'
  )
  assert(
    'pasting bare 10-digit "7712345678" (coincidental double-7) still yields the correct tail',
    extractKzPhoneTail('7712345678') === '712345678'
  )
  assert('typing digits one at a time is not mangled', extractKzPhoneTail('7') === '7')
  assert('tail is capped at 9 digits', extractKzPhoneTail('1234567890123').length === 9)
}

// ---------------------------------------------------------------------------
// Stage 2 — client submission-key UUID (real import)
// ---------------------------------------------------------------------------

async function stageSubmissionKey() {
  console.log('Stage 2: submission key is a valid UUID (real import)')
  const { getOrCreateApplicationSubmissionKey, clearApplicationSubmissionKey } = await load(
    'src/utils/applicationSubmissionKey.js'
  )
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // No `window` in Node, so this always exercises the non-sessionStorage
  // fallback path — the exact path that had produced a non-UUID string before the fix.
  const key = getOrCreateApplicationSubmissionKey('vacancy-fixture-1')
  assert('submission key without window is a well-formed UUID', UUID_RE.test(key), key)

  const key2 = getOrCreateApplicationSubmissionKey('vacancy-fixture-1')
  assert('a second call without persistence still returns a UUID', UUID_RE.test(key2), key2)

  assert('clearing without window does not throw', (() => {
    clearApplicationSubmissionKey('vacancy-fixture-1')
    return true
  })())
}

// ---------------------------------------------------------------------------
// Stage 3 — person grouping / representative selection (real import)
// ---------------------------------------------------------------------------

async function stageGrouping() {
  console.log('Stage 3: groupCandidatesByPerson (real import)')
  const { groupCandidatesByPerson, buildPersonApplicationCounts, countPeopleByVisibleStatus, filterCandidates, createDefaultCandidateFilters } =
    await load('src/utils/candidateListUtils.js')

  const mk = (over) => ({
    fullName: 'Test User',
    phone: '+77010000000',
    age: null,
    isCurrentApplication: true,
    ...over,
  })

  // Person p1 has 3 applications: an old rejected one, a newer "current" one
  // to vacancy X, and another "current" one (different vacancy) to vacancy Y.
  const a1 = mk({ id: 'a1', personId: 'p1', vacancyId: 'vX', status: 'rejected', submittedAt: '2026-01-01T00:00:00Z', isCurrentApplication: false })
  const a2 = mk({ id: 'a2', personId: 'p1', vacancyId: 'vX', status: 'new', submittedAt: '2026-02-01T00:00:00Z', isCurrentApplication: true })
  const a3 = mk({ id: 'a3', personId: 'p1', vacancyId: 'vY', status: 'invited', submittedAt: '2026-01-15T00:00:00Z', isCurrentApplication: true })
  const b1 = mk({ id: 'b1', personId: 'p2', vacancyId: 'vX', status: 'hired', submittedAt: '2026-01-20T00:00:00Z', isCurrentApplication: true })
  const orphan = mk({ id: 'c1', personId: null, vacancyId: 'vZ', status: 'new', submittedAt: '2026-01-01T00:00:00Z' })

  const all = [a1, a2, a3, b1, orphan]
  const rows = groupCandidatesByPerson(all)

  assert('one row per distinct person, unlinked candidates get their own row', rows.length === 3, String(rows.length))

  const rowP1 = rows.find((r) => r.candidate.personId === 'p1')
  assert(
    'representative for a person with two current applications is the NEWEST current one (a2, not a3)',
    rowP1.candidate.id === 'a2',
    rowP1.candidate.id
  )
  assert('representative group carries all 3 of person p1 applications', rowP1.applicationCount === 3, String(rowP1.applicationCount))
  assert('otherApplications excludes only the representative', rowP1.otherApplications.length === 2)

  // No current application in the group at all -> falls back to newest overall.
  const d1 = mk({ id: 'd1', personId: 'p3', vacancyId: 'vX', status: 'rejected', submittedAt: '2026-01-01T00:00:00Z', isCurrentApplication: false })
  const d2 = mk({ id: 'd2', personId: 'p3', vacancyId: 'vY', status: 'rejected', submittedAt: '2026-03-01T00:00:00Z', isCurrentApplication: false })
  const rowsD = groupCandidatesByPerson([d1, d2])
  assert('with no current application, representative is the newest overall', rowsD[0].candidate.id === 'd2')

  const counts = buildPersonApplicationCounts(all)
  assert('buildPersonApplicationCounts counts person p1 as 3', counts.get('p1') === 3)
  assert('buildPersonApplicationCounts ignores unlinked candidates', !counts.has(null) && !counts.has(undefined))

  const defaults = createDefaultCandidateFilters()
  assert('default status filter is "new" (no implicit "all")', defaults.status === 'new')

  // Legacy status visibility mapping, exercised through filterCandidates.
  const legacySuitable = mk({ id: 'leg1', personId: 'p4', vacancyId: 'vX', status: 'suitable', submittedAt: '2026-01-01T00:00:00Z' })
  const legacyTrainee = mk({ id: 'leg2', personId: 'p5', vacancyId: 'vX', status: 'trainee', submittedAt: '2026-01-01T00:00:00Z' })
  assert(
    'legacy "suitable" is reachable when filtering by "new"',
    filterCandidates([legacySuitable], { vacancyId: 'all', status: 'new', ageMin: '', ageMax: '' }, '').length === 1
  )
  assert(
    'legacy "trainee" is reachable when filtering by "interview_passed"',
    filterCandidates([legacyTrainee], { vacancyId: 'all', status: 'interview_passed', ageMin: '', ageMax: '' }, '').length === 1
  )
  assert(
    'legacy "suitable" is NOT reachable when filtering by "rejected"',
    filterCandidates([legacySuitable], { vacancyId: 'all', status: 'rejected', ageMin: '', ageMax: '' }, '').length === 0
  )

  const statusCounts = countPeopleByVisibleStatus(all)
  assert(
    'status counts are per unique person (2 new incl. orphan, 1 hired), not per application',
    statusCounts.new === 2 && statusCounts.hired === 1,
    JSON.stringify(statusCounts)
  )
}

// ---------------------------------------------------------------------------
// Stage 4 — visible status taxonomy (real import)
// ---------------------------------------------------------------------------

async function stageStatusTaxonomy() {
  console.log('Stage 4: 5 visible statuses + legacy mapping (real import)')
  const {
    CANDIDATE_STATUS_VISIBLE_ORDER,
    CANDIDATE_STATUS_LEGACY_VISIBILITY,
    getCandidateVisibleStatusBucket,
    CANDIDATE_STATUS_LABELS,
  } = await load('src/utils/recruitmentData.js')

  assert(
    'exactly 5 visible statuses, in the required order',
    JSON.stringify(CANDIDATE_STATUS_VISIBLE_ORDER) ===
      JSON.stringify(['new', 'rejected', 'invited', 'interview_passed', 'hired']),
    JSON.stringify(CANDIDATE_STATUS_VISIBLE_ORDER)
  )
  assert('no "all" pseudo-status among the visible statuses', !CANDIDATE_STATUS_VISIBLE_ORDER.includes('all'))
  assert(
    'suitable/questionable/maybe/intern/trainee are excluded from the visible statuses',
    ['suitable', 'questionable', 'maybe', 'intern', 'trainee'].every(
      (s) => !CANDIDATE_STATUS_VISIBLE_ORDER.includes(s)
    )
  )
  assert('legacy suitable -> new', getCandidateVisibleStatusBucket('suitable') === 'new')
  assert('legacy questionable -> new', getCandidateVisibleStatusBucket('questionable') === 'new')
  assert('legacy maybe -> new', getCandidateVisibleStatusBucket('maybe') === 'new')
  assert('legacy intern -> interview_passed', getCandidateVisibleStatusBucket('intern') === 'interview_passed')
  assert('legacy trainee -> interview_passed', getCandidateVisibleStatusBucket('trainee') === 'interview_passed')
  assert('unrecognized legacy value defaults to new', getCandidateVisibleStatusBucket('totally_unknown') === 'new')
  assert(
    'every legacy status still maps into a visible bucket',
    Object.values(CANDIDATE_STATUS_LEGACY_VISIBILITY).every((s) => CANDIDATE_STATUS_VISIBLE_ORDER.includes(s))
  )
  for (const s of CANDIDATE_STATUS_VISIBLE_ORDER) {
    assert(`a Russian label exists for visible status "${s}"`, Boolean(CANDIDATE_STATUS_LABELS[s]))
  }
}

// ---------------------------------------------------------------------------
// Stage 5 — historical (non-current) application is read-only (real import)
// ---------------------------------------------------------------------------

async function stageHistoricalReadOnly() {
  console.log('Stage 5: historical application actions (real import)')
  const { getCandidateDetailActions } = await load('src/utils/candidateDisplayUtils.js')

  const current = { status: 'new', isCurrentApplication: true, createdUserId: null }
  const historical = { status: 'new', isCurrentApplication: false, createdUserId: null }
  const historicalInvited = { status: 'invited', isCurrentApplication: false, createdUserId: null }

  const currentActions = getCandidateDetailActions(current)
  assert('a current "new" application still offers actions (invite/reject)', currentActions.invite === true && currentActions.reject === true)

  for (const [label, candidate] of [
    ['new', historical],
    ['invited', historicalInvited],
  ]) {
    const actions = getCandidateDetailActions(candidate)
    assert(
      `historical application (status=${label}) has every action false`,
      Object.values(actions).every((v) => v === false),
      JSON.stringify(actions)
    )
  }
}

// ---------------------------------------------------------------------------
// Stage 6 — error message mapping (real import)
// ---------------------------------------------------------------------------

async function stageErrorMapping() {
  console.log('Stage 6: RPC/local error message mapping (real import)')
  const { mapApplicationFormRpcError } = await load('src/utils/applicationForm.js')

  assert(
    'phone_invalid_kz maps to a clear Russian format message',
    /\+7 7XX XXX XX XX/.test(mapApplicationFormRpcError({ message: 'phone_invalid_kz' }) || '')
  )
  assert(
    'submission_key_conflict maps to a clear Russian message',
    Boolean(mapApplicationFormRpcError({ message: 'submission_key_conflict' }))
  )
}

// ---------------------------------------------------------------------------
// Stage 7 — local adapter dedupe/idempotency logic (static source checks;
// not imported — it touches `localStorage`, which Node does not provide).
// ---------------------------------------------------------------------------

function stageLocalAdapterStatic() {
  console.log('Stage 7: local adapter dedupe (static source checks)')
  const src = read('src/services/recruitmentLocalAdapter.js')

  assert('local adapter imports the real KZ phone normalizer', src.includes("import { normalizeKzMobilePhone } from '../utils/kzPhone'"))
  assert('phone is normalized before identity lookup', src.includes('normalizeKzMobilePhone(fields.phone)'))
  assert('person is found-or-created by canonical phone', src.includes('findOrCreatePersonId(canonicalPhone'))
  assert(
    'legacy (un-linked) candidates sharing the canonical phone are retroactively linked before the duplicate check',
    /const legacyVacancyIds = new Set\(\)[\s\S]{0,400}normalizeKzMobilePhone\(c\.phone\) === canonicalPhone/.test(src)
  )
  assert(
    'current-application is recomputed for each legacy vacancy group that got linked',
    src.includes('legacyVacancyIds.forEach') && src.includes('recomputeCurrentApplication(bundle.candidates, personId, vId)')
  )
  assert(
    'same person + same vacancy + current non-rejected application short-circuits without inserting',
    /existingCurrent[\s\S]{0,50}=[\s\S]{0,200}c\.isCurrentApplication && c\.status !== CANDIDATE_STATUS\.REJECTED/.test(src)
  )
  assert('duplicate short-circuit returns duplicate: true without an insert', /existingCurrent\)[\s\S]{0,150}duplicate: true/.test(src))
  assert('new rows start not-current; recomputeCurrentApplication resolves the winner', src.includes('isCurrentApplication: false, // recomputeCurrentApplication resolves the group below'))
  assert('current-application is recomputed after every insert', src.includes('bundle.candidates = recomputeCurrentApplication(bundle.candidates, personId, vacancy.id)'))
  assert('status changes (reject/restore/hire) recompute current-application too', /if \(updates\.status != null\)[\s\S]{0,200}recomputeCurrentApplication/.test(src))
  assert(
    'furthest-progress ranking mirrors the SQL candidate_status_progress_rank (hired highest, rejected lowest)',
    /hired:\s*6/.test(src) && /rejected:\s*0/.test(src)
  )
  assert('submission key replay short-circuits before touching the vacancy/answers', src.includes('bundle.candidates.find((c) => c.submissionKey === submissionKey)'))
  assert('replaying a submission key for a different vacancy raises a conflict', /existingByKey\.vacancyId !== applicationData\.vacancyId[\s\S]{0,60}submission_key_conflict/.test(src))
  assert('an unparseable phone throws instead of silently saving garbage', src.includes('if (!canonicalPhone) {'))
  assert('new candidate rows persist person_id/submission_key/is_current_application', src.includes('person_id: c.personId ?? null') && src.includes('submission_key: c.submissionKey ?? null') && src.includes('is_current_application: c.isCurrentApplication !== false'))
}

// ---------------------------------------------------------------------------
// Stage 8 — SQL migration static checks
// ---------------------------------------------------------------------------

function stageSqlMigration() {
  console.log('Stage 8: migration static checks')
  const mig = read(MIGRATION)

  // Never touches existing rows destructively.
  assert('migration contains no DELETE FROM', !/delete\s+from\b/i.test(mig))
  assert('migration contains no TRUNCATE', !/\btruncate\b/i.test(mig))
  assert('migration contains no DROP TABLE', !/drop\s+table\b/i.test(mig))

  // academy_people: table + RLS, no anon access, HR-permission-gated.
  assert('academy_people table created', mig.includes('create table if not exists public.academy_people ('))
  assert('academy_people.phone_canonical unique only when not null (unmatched legacy stays distinct)', mig.includes('academy_people_phone_canonical_uidx') && mig.includes('where phone_canonical is not null'))
  assert('academy_people RLS enabled', mig.includes('alter table public.academy_people enable row level security;'))
  assert('academy_people has no anon table grant', mig.includes('revoke all on table public.academy_people from anon;'))
  assert('academy_people has no authenticated blanket grant (select only via policy)', mig.includes('revoke all on table public.academy_people from authenticated;'))
  assert(
    'academy_people HR select is gated by recruitment.view / recruitment.manage_candidates',
    mig.includes('academy_people_hr_select') &&
      mig.includes("auth_private.current_user_has_permission('recruitment.view')") &&
      mig.includes("auth_private.current_user_has_permission('recruitment.manage_candidates')")
  )

  // Candidate row: person link + idempotency + current-application flag.
  assert('person_id column added to academy_candidates', mig.includes('add column if not exists person_id uuid references public.academy_people(id)'))
  assert('submission_key column added, unique only when present', mig.includes('academy_candidates_submission_key_uidx') && mig.includes('where submission_key is not null'))
  assert('at most one current application per (person, vacancy)', mig.includes('academy_candidates_person_vacancy_current_uidx') && mig.includes('where is_current_application'))
  assert('current-application maintenance trigger installed', mig.includes('academy_candidates_maintain_current_trg'))

  // New rows store the canonical phone, not raw as-typed text.
  assert('insert stores the canonical phone in the phone column', /v_full_name,\s*\n\s*v_canonical_phone,\s*\n\s*v_age,/.test(mig))
  assert('insert no longer stores the raw btrim(v_phone) as the phone column', !mig.includes('btrim(v_phone),'))

  // Overload arity: legacy 4-arg keeps a default, new 5-arg has none (unambiguous overload resolution).
  assert(
    'legacy 4-arg overload keeps p_photo_upload_id default null',
    /create or replace function public\.submit_candidate_application\(\s*\n\s*p_vacancy_id uuid,\s*\n\s*p_answers jsonb,\s*\n\s*p_form_version integer,\s*\n\s*p_photo_upload_id uuid default null\s*\n\)/.test(mig)
  )
  assert(
    '5-arg overload has NO default on p_photo_upload_id/p_submission_key',
    /p_photo_upload_id uuid,\s*\n\s*p_submission_key uuid\s*\n\)/.test(mig)
  )
  assert(
    'both overloads remain executable by anon/authenticated/service_role',
    mig.includes('grant execute on function public.submit_candidate_application(uuid, jsonb, integer, uuid)\n  to anon, authenticated, service_role;') &&
      mig.includes('grant execute on function public.submit_candidate_application(uuid, jsonb, integer, uuid, uuid)\n  to anon, authenticated, service_role;')
  )

  // Idempotency/replay correctness.
  assert(
    'submission_key replay checks the vacancy matches before returning the existing row',
    /v_existing_by_key\.vacancy_id is distinct from p_vacancy_id[\s\S]{0,80}submission_key_conflict/.test(mig)
  )
  const conflictCount = (mig.match(/submission_key_conflict/g) || []).length
  assert('submission_key_conflict is raised in both the early-replay path and the unique_violation safety net', conflictCount >= 2, String(conflictCount))
  assert('advisory locks guard the person and person+vacancy sections against SELECT-then-INSERT races', mig.includes("recruitment_advisory_key('person:'") && mig.includes("recruitment_advisory_key('pv:'"))

  // v_num declared exactly once (no duplicate declaration).
  const vNumMatches = mig.match(/\bv_num\s+numeric\s*;/g) || []
  assert('v_num declared exactly once', vNumMatches.length === 1, String(vNumMatches.length))

  // Helper/private lockdown: PUBLIC execute revoked, recruitment_private schema isolated.
  for (const fn of [
    'public.recruitment_advisory_key(text)',
    'public.normalize_kz_mobile_phone(text)',
    'public.candidate_status_progress_rank(text)',
    'public.academy_candidates_maintain_current()',
  ]) {
    assert(
      `${fn}: EXECUTE revoked from public/anon/authenticated`,
      mig.includes(`revoke all on function ${fn} from public;`) &&
        mig.includes(`revoke all on function ${fn} from anon;`) &&
        mig.includes(`revoke all on function ${fn} from authenticated;`)
    )
  }
  assert('recruitment_private schema created', mig.includes('create schema if not exists recruitment_private;'))
  assert(
    'recruitment_private schema USAGE revoked from public/anon/authenticated, granted only to service_role',
    mig.includes('revoke all on schema recruitment_private from public;') &&
      mig.includes('revoke all on schema recruitment_private from anon;') &&
      mig.includes('revoke all on schema recruitment_private from authenticated;') &&
      mig.includes('grant usage on schema recruitment_private to service_role;')
  )
  const coreFn = 'recruitment_private.submit_candidate_application_core(uuid, jsonb, integer, uuid, uuid)'
  assert(
    'core submit function revoked from public/anon/authenticated, granted only to service_role',
    mig.includes(`revoke all on function ${coreFn} from public;`) &&
      mig.includes(`revoke all on function ${coreFn} from anon;`) &&
      mig.includes(`revoke all on function ${coreFn} from authenticated;`) &&
      mig.includes(`grant execute on function ${coreFn}\n  to service_role;`)
  )
}

// ---------------------------------------------------------------------------
// Stage 9 — HR UI static checks
// ---------------------------------------------------------------------------

function stageUi() {
  console.log('Stage 9: HR Candidates UI static checks')

  const table = read('src/components/hr/CandidatesTable.jsx')
  const headerBlock = table.slice(table.indexOf('<thead>'), table.indexOf('</thead>'))
  const idxPos = headerBlock.indexOf('candidates-table__col-index')
  const datePos = headerBlock.indexOf('Дата заявки')
  const candidatePos = headerBlock.indexOf('candidates-table__col-candidate')
  assert('column order: № first', idxPos !== -1 && idxPos < datePos)
  assert('column order: Дата заявки second, before Кандидат', datePos !== -1 && datePos < candidatePos)
  assert('row number uses the page offset (global numbering across pages)', table.includes('rowNumberOffset + index + 1'))
  assert('application-count indicator shown next to the candidate name', table.includes('candidate.applicationCount'))

  const section = read('src/components/admin/sections/CandidatesSection.jsx')
  assert('CandidatesSection renders TablePagination (reused from procurement)', section.includes("import TablePagination from '../../procurement/TablePagination'") && section.includes('<TablePagination'))
  assert('pagination page/pageSize state exists', /const \[page, setPage\] = useState\(1\)/.test(section) && /const \[pageSize, setPageSize\] = useState\(/.test(section))
  assert('pagination resets to page 1 when filters/search/page size change', /setPage\(1\)[\s\S]{0,80}\[appliedFilters, debouncedSearch, pageSize\]/.test(section))
  assert('status control is wired as an always-visible primary control, not a popover filter', section.includes('statusValue={appliedFilters.status}') && section.includes('onStatusChange='))
  assert('summary counters (unique people + total applications) rendered', section.includes('uniquePeopleCount') && /candidates\.length/.test(section))

  const toolbar = read('src/components/hr/CandidatesToolbar.jsx')
  assert('CandidatesToolbar renders the segmented status control', toolbar.includes('<CandidateStatusSegmentedControl'))

  const segmented = read('src/components/hr/CandidateStatusSegmentedControl.jsx')
  assert('segmented control has no "all statuses" option', !segmented.includes('Все статусы') && !/value === ['"]all['"]/.test(segmented))
  assert('segmented control maps exactly the 5 visible statuses', segmented.includes('CANDIDATE_STATUS_VISIBLE_ORDER.map'))

  const filterFields = read('src/components/hr/CandidateFiltersFields.jsx')
  assert('status select removed from the collapsible filter popover/sheet', !filterFields.includes('Статус') && !filterFields.includes('Все статусы'))
}

async function main() {
  console.log('=== Recruitment candidate dedupe verification ===\n')
  await stagePhoneNormalization()
  await stageSubmissionKey()
  await stageGrouping()
  await stageStatusTaxonomy()
  await stageHistoricalReadOnly()
  await stageErrorMapping()
  stageLocalAdapterStatic()
  stageSqlMigration()
  stageUi()
  console.log(`\n=== All ${checks} checks passed ===\n`)
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`)
  process.exit(1)
})
