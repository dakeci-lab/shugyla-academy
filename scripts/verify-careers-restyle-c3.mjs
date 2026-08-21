#!/usr/bin/env node
/**
 * Careers restyle C3: vacancy detail layout + mobile sticky CTA.
 *
 * Usage:
 *   npm run verify:careers-restyle-c3
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

function assert(label, condition) {
  checks += 1
  if (!condition) throw new Error(`FAIL: ${label}`)
  console.log(`  ✓ ${label}`)
}

const page = read('src/pages/VacancyDetailPage.jsx')
const css = read('src/pages/VacancyDetail.css')
const display = read('src/utils/careersVacancyDisplay.js')
const i18n = read('src/utils/i18n.js')
const hub = read('src/pages/ApplyHub.jsx')
const contact = read('src/components/careers/careersContact.js')
const layout = read('src/layouts/CareersPublicLayout.jsx')

assert(
  'detail still uses fetchPublishedVacanciesForApply (no new RPC)',
  page.includes('fetchPublishedVacanciesForApply') && !page.includes("rpc('")
)
assert(
  'detail employee photo is square asset + aspect',
  page.includes('photo-team-employee-square.jpg') &&
    page.includes('aspect="square"') &&
    !page.includes('vacancy-detail__ph--tall')
)
assert(
  'detail has back link to vacancies list',
  page.includes('vacancy-detail__back') && page.includes('careersAllVacanciesLink')
)
assert(
  'detail maps content blocks via helper',
  page.includes('getPublicVacancyContentBlocks') &&
    display.includes('getPublicVacancyContentBlocks') &&
    display.includes('duties') &&
    display.includes('experienceRequirement') &&
    display.includes('formatVacancySalary')
)
assert(
  'content blocks do not invent duties without description',
  display.includes("String(vacancy?.description || '').trim()") &&
    display.includes('careersVacancyDutiesTitle')
)
assert(
  'desktop + sticky apply CTAs share /apply/:slug',
  page.includes('careersRespondCta') &&
    (page.match(/\/apply\/\$\{encodeURIComponent/g) || []).length >= 1 &&
    page.includes('vacancy-detail__sticky-cta') &&
    page.includes('sticky-cta')
)
assert(
  'sticky CTA styled for mobile with safe-area padding on main',
  css.includes('.vacancy-detail__sticky-cta') &&
    css.includes('position: sticky') &&
    css.includes('safe-area-inset-bottom') &&
    css.includes('padding: 1.25rem 1.25rem 6.5rem')
)
assert(
  'CTA min-height at least 48px',
  css.includes('min-height: 48px')
)
assert(
  'i18n has ru+kz detail strings',
  i18n.includes('careersRespondCta') &&
    i18n.includes('careersVacancyDutiesTitle') &&
    i18n.includes('careersVacancyExpectTitle') &&
    i18n.includes('careersVacancyOfferTitle') &&
    (i18n.match(/careersRespondCta:/g) || []).length >= 2
)
assert(
  'empty/closed/error states preserved',
  page.includes('careersClosedTitle') &&
    page.includes('careersLoadError') &&
    page.includes('careersLoading')
)
assert(
  'C2 hub contact/owner constants untouched',
  hub.includes('careers-hero') &&
    contact.includes('+7 706 840 5000') &&
    contact.includes('shugyla.market.tur@gmail.com')
)
assert(
  'C1 layout footer/montserrat intact',
  layout.includes('CareersFooter') && layout.includes('careers-montserrat-font')
)

console.log(`\n${checks}/${checks} checks passed`)
