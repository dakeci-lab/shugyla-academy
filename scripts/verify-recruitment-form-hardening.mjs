/**
 * Static verify: Stage 5.1 upload sessions + transactional duplicate + snapshot hardening.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

const checks = []
function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) })
  if (!condition) console.error(`FAIL: ${name}`)
  else console.log(`OK: ${name}`)
}

const mig = read('supabase/migrations/20260803210000_recruitment_form_hardening.sql')
const photo = read('src/services/candidatePhotoService.js')
const adapter = read('src/services/recruitmentSupabaseAdapter.js')
const apply = read('src/pages/Apply.jsx')
const formUtils = read('src/utils/applicationForm.js')
const cleanup = 'scripts/cleanup-recruitment-upload-sessions.mjs'

assert('upload sessions table', mig.includes('recruitment_application_uploads'))
assert('create upload session RPC', mig.includes('create_candidate_photo_upload_session'))
assert('cancel upload session RPC', mig.includes('cancel_candidate_photo_upload_session'))
assert('upload session TTL 60 minutes', mig.includes("interval '60 minutes'"))
assert('submit uses photo upload id', mig.includes('p_photo_upload_id'))
assert('submit no arbitrary photo_path param', !mig.includes('p_photo_path text'))
const submitFn = mig.slice(mig.indexOf('create or replace function public.submit_candidate_application'))
assert('outdated checked before upload lock', submitFn.indexOf('form_outdated') < submitFn.indexOf('for update'))
assert('token used rejected', mig.includes('photo_token_used'))
assert('token expired rejected', mig.includes('photo_token_expired'))
assert('vacancy mismatch rejected', mig.includes('v_upload.vacancy_id is distinct from p_vacancy_id'))
assert('anon cannot grant select uploads', mig.includes('revoke all on table public.recruitment_application_uploads from anon'))
assert('duplicate vacancy RPC', mig.includes('duplicate_vacancy_with_application_form'))
assert('duplicate creates draft', mig.includes("'draft'"))
assert('duplicate skips form seed', mig.includes('recruitment.skip_form_seed'))
assert('duplicate validates source form', mig.includes('validate_vacancy_application_form(p_source_vacancy_id, true)'))
assert('duplicate permission gated', mig.includes('recruitment.manage_vacancies'))

assert('client creates upload session', photo.includes('create_candidate_photo_upload_session'))
assert('client uploads to server path', photo.includes('session.storage_path'))
assert('client upsert false', photo.includes('upsert: false'))
assert('client path builder deprecated', photo.includes('@deprecated'))
assert('adapter submit uses upload id', adapter.includes('p_photo_upload_id'))
assert('adapter duplicate uses RPC', adapter.includes('duplicate_vacancy_with_application_form'))
assert('Apply tracks photoUploadId', apply.includes('photoUploadId'))
assert('Apply blocks submit while uploading', apply.includes('photoUploading'))
assert('Apply cancels upload session', apply.includes('cancelCandidatePhotoUploadSession'))

assert('snapshot reader catches malformed JSON', formUtils.includes('JSON.parse') && formUtils.includes('catch'))
assert('snapshot skips bad items', formUtils.includes("typeof item !== 'object'"))
assert('error map has token expired', formUtils.includes('photo_token_expired'))
assert('cleanup script exists', existsSync(resolve(root, cleanup)))
assert('cleanup defaults dry-run', read(cleanup).includes('dry_run=true'))

const failed = checks.filter((c) => !c.ok)
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed`)
