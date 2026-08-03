/**
 * Static verify: Stage 2.1 private candidate photos invariants.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

const checks = []
function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) })
  if (!condition) console.error(`FAIL: ${name}`)
  else console.log(`OK: ${name}`)
}

const photoService = read('src/services/candidatePhotoService.js')
const adapter = read('src/services/recruitmentSupabaseAdapter.js')
const migration = read('supabase/migrations/20260803140000_privatize_candidate_photos.sql')
const applyPage = read('src/pages/Apply.jsx')

assert('upload builds applications/uuid path', photoService.includes('applications/'))
assert('upload uses upsert false', photoService.includes('upsert: false'))
assert('no getPublicUrl in photo service', !photoService.includes('getPublicUrl'))
assert('signed URL helper exists', photoService.includes('createCandidatePhotoSignedUrl'))
assert('batch signed URLs for HR fetch', adapter.includes('attachCandidatePhotoSignedUrls'))
assert('RPC submit clears photo_url', adapter.includes('p_photo_url: null'))
assert('migration sets bucket private', migration.includes('public = false'))
assert('migration sets mime limits', migration.includes('image/jpeg') && migration.includes('file_size_limit'))
assert('migration clears public photo_url', migration.includes('photo_url = null'))
assert('Apply still validates photo file', applyPage.includes('validateCandidatePhotoFile'))

const failed = checks.filter((c) => !c.ok)
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed`)
