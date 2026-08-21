#!/usr/bin/env node
/**
 * Careers restyle C2: hub hero / benefits / vacancy cards / about / contact.
 *
 * Usage:
 *   npm run verify:careers-restyle-c2
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

const hub = read('src/pages/ApplyHub.jsx')
const css = read('src/pages/ApplyHub.css')
const contact = read('src/components/careers/careersContact.js')
const i18n = read('src/utils/i18n.js')
const footer = read('src/components/careers/CareersFooter.jsx')
const layout = read('src/layouts/CareersPublicLayout.jsx')

assert(
  'hub still loads vacancies via fetchPublishedVacanciesForApply',
  hub.includes('fetchPublishedVacanciesForApply')
)
assert(
  'hub has hero with eyebrow + dual CTAs',
  hub.includes('careers-hero') &&
    hub.includes('careersHeroEyebrow') &&
    hub.includes('careersHeroPrimaryCta') &&
    hub.includes('careersHeroSecondaryCta')
)
assert(
  'hub hero uses store facade photo',
  hub.includes('CareersPhoto') &&
    hub.includes('photo-store-facade.jpg') &&
    hub.includes('careersHeroPhotoLabel')
)
assert(
  'hub about uses team employee photo',
  hub.includes('photo-team-employee.jpg') && hub.includes('careersAboutPhotoLabel')
)
assert(
  'hub renders benefits cards',
  hub.includes('careers-benefits') &&
    hub.includes('careersBenefitStabilityTitle') &&
    hub.includes('careersBenefitCareTitle')
)
assert(
  'vacancy cards are full-row links without giant primary CTA button',
  hub.includes('careers-vacancy-card') &&
    hub.includes('/vacancies/') &&
    !hub.includes('apply-hub-card__cta') &&
    !hub.includes('btn--primary apply-hub')
)
assert(
  'vacancy card has icon title meta chevron structure',
  hub.includes('careers-vacancy-card__icon') &&
    hub.includes('careers-vacancy-card__title') &&
    hub.includes('careers-vacancy-card__meta') &&
    hub.includes('careers-vacancy-card__chev')
)
assert(
  'city filter preserved',
  hub.includes('careersCityFilter') && hub.includes('selectedCity')
)
assert(
  'about band present with pattern',
  hub.includes('careers-about') &&
    hub.includes('careersAboutTitle') &&
    hub.includes('careers-about__pattern')
)
assert(
  'contact band uses CAREERS_CONTACT + mailto CTA',
  hub.includes('careers-contact') &&
    hub.includes('CAREERS_CONTACT') &&
    hub.includes('careersContactCta') &&
    hub.includes('mailto:')
)
assert(
  'owner-confirmed contact constants',
  contact.includes('+7 706 840 5000') &&
    contact.includes('shugyla.market.tur@gmail.com') &&
    contact.includes("address: 'Туркестан'") &&
    !contact.includes('TODO(owner)') &&
    !contact.includes('+7 707 123 45 67')
)
assert(
  'footer still consumes CAREERS_CONTACT',
  footer.includes('CAREERS_CONTACT') && layout.includes('CareersFooter')
)
assert(
  'i18n has ru+kz hub restyle keys',
  i18n.includes('careersHeroEyebrow') &&
    i18n.includes('careersBenefitStabilityTitle') &&
    i18n.includes('careersAboutTitle') &&
    i18n.includes('careersContactCta') &&
    (i18n.match(/careersHeroEyebrow:/g) || []).length >= 2
)
assert(
  'hub CSS styles hero benefits vacancy about contact',
  css.includes('.careers-hero') &&
    css.includes('.careers-benefits__grid') &&
    css.includes('.careers-vacancy-card') &&
    css.includes('.careers-about__band') &&
    css.includes('.careers-contact__band')
)
assert(
  'hub does not invent new vacancy service/RPC',
  !hub.includes("rpc('") && !hub.includes('list_published_vacancies')
)
assert(
  'C1 Montserrat inject left intact',
  layout.includes('careers-montserrat-font') && layout.includes('Montserrat')
)

console.log(`\n${checks}/${checks} checks passed`)
