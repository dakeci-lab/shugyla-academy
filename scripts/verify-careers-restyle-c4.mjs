#!/usr/bin/env node
/**
 * Careers restyle C4: apply form visual, photo uploader, sticky submit, success state.
 *
 * Usage:
 *   npm run verify:careers-restyle-c4
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let checks = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath))
}

function assert(label, condition) {
  checks += 1
  if (!condition) throw new Error(`FAIL: ${label}`)
  console.log(`  ✓ ${label}`)
}

const apply = read('src/pages/Apply.jsx')
const css = read('src/pages/Apply.css')
const form = read('src/components/apply/DynamicApplicationForm.jsx')
const i18n = read('src/utils/i18n.js')
const submit = read('src/services/publicApplySubmitService.js')
const photo = read('src/services/candidatePhotoService.js')
const detail = read('src/pages/VacancyDetailPage.jsx')
const hub = read('src/pages/ApplyHub.jsx')

assert(
  'success remains submitted state (no new success route)',
  apply.includes('if (submitted)') &&
    apply.includes('apply-success') &&
    !apply.includes('path="/apply/:slug/success"') &&
    !apply.includes("Navigate to={`/apply/${")
)
assert(
  'success uses icon-sunmark + check badge + pattern gallery',
  apply.includes('icon-sunmark.png') &&
    apply.includes('apply-success__check') &&
    apply.includes('pattern-tile.svg') &&
    apply.includes('apply-success__gallery') &&
    !apply.includes('data:image') &&
    !css.includes('base64')
)
assert(
  'form has trust block + consent + careersApply form id',
  apply.includes('careersFormTrust') &&
    apply.includes('careers-consent') &&
    apply.includes('careers-apply-form') &&
    apply.includes("id={APPLY_FORM_ID}")
)
assert(
  'mobile sticky submit shares form id and disables with submitting',
  apply.includes('apply-page__sticky-cta') &&
    apply.includes('sticky-cta') &&
    apply.includes('form={APPLY_FORM_ID}') &&
    apply.includes('submitDisabled') &&
    apply.includes('submitting || photoUploading')
)
assert(
  'photo uploader is custom UI without changing upload API',
  form.includes('apply-photo-uploader') &&
    form.includes('type="file"') &&
    form.includes('onPhotoChange') &&
    apply.includes('prepareCandidatePhotoForSubmit') &&
    apply.includes('validateCandidatePhotoFile') &&
    apply.includes('cancelCandidatePhotoUploadSession')
)
assert(
  'submit/photo services untouched (RPC session still present)',
  submit.includes('submitPublicCandidateApplication') &&
    photo.includes('create_candidate_photo_upload_session') &&
    photo.includes('prepareCandidatePhotoForSubmit')
)
assert(
  'submissionKey / formVersion still used',
  apply.includes('getOrCreateApplicationSubmissionKey') &&
    apply.includes('formVersion') &&
    apply.includes('submissionKey')
)
assert(
  'inputs target min-height 48px',
  css.includes('.apply-form__control') && css.includes('min-height: 48px')
)
assert(
  'i18n has ru+kz form/success strings',
  (i18n.match(/careersSuccessHeading:/g) || []).length >= 2 &&
    (i18n.match(/careersPhotoUploadTitle:/g) || []).length >= 2 &&
    (i18n.match(/careersFormTrust:/g) || []).length >= 2
)
assert(
  'C3 detail + C2 hub left intact',
  detail.includes('vacancy-detail__sticky-cta') && hub.includes('careers-hero')
)
assert(
  'sunmark asset present',
  exists('src/assets/brand/logo/icon-sunmark.png')
)

console.log(`\n${checks}/${checks} checks passed`)
