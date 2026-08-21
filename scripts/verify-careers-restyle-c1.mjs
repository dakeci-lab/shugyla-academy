#!/usr/bin/env node
/**
 * Careers restyle C1: tokens, Bluecurve, header logo, footer, scoped lang pills.
 *
 * Usage:
 *   npm run verify:careers-restyle-c1
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

const tokens = read('src/components/careers/careers-tokens.css')
const layoutJs = read('src/layouts/CareersPublicLayout.jsx')
const layoutCss = read('src/layouts/CareersPublicLayout.css')
const headerJs = read('src/components/careers/CareersHeader.jsx')
const headerCss = read('src/components/careers/CareersHeader.css')
const footerJs = read('src/components/careers/CareersFooter.jsx')
const contact = read('src/components/careers/careersContact.js')
const langGlobal = read('src/components/LangSwitch.css')
const platformLayout = exists('src/layouts/PlatformLayout.jsx')
  ? read('src/layouts/PlatformLayout.jsx')
  : ''

assert(
  'brand font files present',
  exists('src/assets/brand/fonts/Bluecurve-Light.ttf') &&
    exists('src/assets/brand/fonts/Bluecurve-Regular.ttf') &&
    exists('src/assets/brand/fonts/Bluecurve-Bold.ttf')
)
assert(
  'brand logo files present',
  exists('src/assets/brand/logo/logo-primary.png') &&
    exists('src/assets/brand/logo/logo-on-green.png')
)
assert(
  'tokens declare brand CSS variables',
  tokens.includes('--brand-green') &&
    tokens.includes('--brand-orange') &&
    tokens.includes('--brand-cream') &&
    tokens.includes('--font-display')
)
assert(
  'tokens @font-face Bluecurve from src/assets/brand/fonts',
  tokens.includes('@font-face') &&
    tokens.includes('Bluecurve-Regular.ttf') &&
    tokens.includes('Bluecurve-Bold.ttf') &&
    tokens.includes('Bluecurve-Light.ttf')
)
assert(
  'layout imports careers-tokens.css',
  layoutJs.includes("careers-tokens.css") || layoutCss.includes('careers-tokens')
)
assert(
  'layout mounts CareersFooter',
  layoutJs.includes('CareersFooter') && layoutJs.includes('<CareersFooter')
)
assert(
  'Montserrat loaded only in careers layout (inject + cleanup)',
  layoutJs.includes('fonts.googleapis.com') &&
    layoutJs.includes('Montserrat') &&
    layoutJs.includes('careers-montserrat-font') &&
    layoutJs.includes('.remove()')
)
assert(
  'platform layout does not load Montserrat',
  !platformLayout.includes('fonts.googleapis.com') && !platformLayout.includes('Montserrat')
)
assert(
  'layout background is reference cream (no radial greens)',
  layoutCss.includes('#efeae4') && !layoutCss.includes('radial-gradient')
)
assert(
  'header uses logo-primary.png',
  headerJs.includes('logo-primary.png') && headerJs.includes('careers-header__logo')
)
assert(
  'header keeps LangSwitch',
  headerJs.includes('LangSwitch') && !headerJs.includes('careers-header__mark')
)
assert(
  'lang pills scoped under .careers-header',
  headerCss.includes('.careers-header .lang-switch') &&
    headerCss.includes('border-radius: 999px') &&
    headerCss.includes('var(--brand-orange)')
)
assert(
  'global LangSwitch.css not rewritten to brand cream pills',
  !langGlobal.includes('--brand-cream') && !langGlobal.includes('--brand-orange')
)
assert(
  'footer uses logo-on-green and contact constants',
  footerJs.includes('logo-on-green.png') &&
    footerJs.includes('CAREERS_CONTACT') &&
    footerJs.includes('careers-footer')
)
assert(
  'contact uses owner-confirmed phone and email',
  contact.includes('+7 706 840 5000') &&
    contact.includes('shugyla.market.tur@gmail.com') &&
    contact.includes('Туркестан') &&
    !contact.includes('TODO(owner)')
)
assert(
  'design reference present for restyle',
  exists('design-reference/shugyla-career-concept.html')
)
assert(
  'docs audit + plan present',
  exists('docs/careers/audit-public-careers-restyle.md') &&
    exists('docs/careers/plan-public-careers-restyle.md')
)

console.log(`\n${checks}/${checks} checks passed`)
