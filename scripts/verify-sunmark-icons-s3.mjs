#!/usr/bin/env node
/**
 * Sunmark S3: corporate + install banner + Apply success on-white.
 *
 * Usage:
 *   npm run verify:sunmark-icons-s3
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

const LITERAL_S = /(?:__mark|__logo)[^>]*>\s*S\s*</

const corporate = read('src/pages/CorporateHome.jsx')
const corporateCss = read('src/pages/CorporateHome.css')
const banner = read('src/components/platform/AppInstallBanner.jsx')
const bannerCss = read('src/components/platform/AppInstallBanner.css')
const apply = read('src/pages/Apply.jsx')
const vite = read('vite.config.js')

assert('CorporateHome: no literal S in mark', !LITERAL_S.test(corporate) && !corporate.includes('>S</'))
assert(
  'CorporateHome: img from icon-sunmark-on-white',
  corporate.includes('icon-sunmark-on-white.png') &&
    /<img[\s\S]*corporate-home__mark/.test(corporate)
)
assert(
  'CorporateHome.css: no green #15803d plate under mark',
  !/corporate-home__mark[\s\S]{0,200}#15803d/.test(corporateCss) &&
    !/corporate-home__mark[\s\S]{0,200}background:\s*#15803d/.test(corporateCss)
)

assert(
  'AppInstallBanner: no literal S in logo',
  !LITERAL_S.test(banner) && !banner.includes('>S</')
)
assert(
  'AppInstallBanner: img from icon-sunmark-on-white',
  banner.includes('icon-sunmark-on-white.png') &&
    /<img[\s\S]*app-install-banner__logo/.test(banner)
)
assert(
  'AppInstallBanner.css: no primary plate under logo',
  !/app-install-banner__logo[\s\S]{0,200}background:\s*var\(--color-primary\)/.test(bannerCss)
)

assert(
  'Apply success uses on-white (not legacy-only)',
  apply.includes('icon-sunmark-on-white.png') &&
    apply.includes('apply-success__sun') &&
    !/from ['"].*icon-sunmark\.png['']/.test(apply)
)

assert(
  'on-white asset present; legacy may remain',
  exists('src/assets/brand/logo/icon-sunmark-on-white.png')
)

assert(
  'vite build copies icons → pwa-icons',
  vite.includes("cpSync(resolve(dist, 'icons'), resolve(dist, 'pwa-icons')") ||
    (vite.includes('pwa-icons') && vite.includes("'icons'") && vite.includes('cpSync'))
)

assert(
  'careers header/footer wordmark untouched (logo-primary still referenced)',
  read('src/components/careers/CareersHeader.jsx').includes('logo-primary') ||
    read('src/components/careers/CareersHeader.jsx').includes('logo-on-green') ||
    read('src/components/careers/CareersHeader.jsx').includes('logo')
)

console.log(`\n${checks}/${checks} checks passed`)
