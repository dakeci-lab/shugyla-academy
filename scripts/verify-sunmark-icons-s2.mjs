#!/usr/bin/env node
/**
 * Sunmark S2: platform / login / legacy / offline «S» → sunmark img.
 *
 * Usage:
 *   npm run verify:sunmark-icons-s2
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

/** Letter-S as sole content of a logo mark/icon/brand-logo element. */
const LITERAL_S = /(?:logo-mark|logo-icon|brand-logo)[^>]*>\s*S\s*</

const jsxTargets = [
  'src/components/platform/PlatformDesktopNav.jsx',
  'src/components/platform/PlatformSidebar.jsx',
  'src/pages/Login.jsx',
  'src/pages/ForgotPassword.jsx',
  'src/pages/ResetPassword.jsx',
  'src/components/Sidebar.jsx',
  'src/components/Header.jsx',
]

for (const file of jsxTargets) {
  const src = read(file)
  assert(`${file}: no literal S in logo mark/icon`, !LITERAL_S.test(src))
  assert(
    `${file}: imports icon-sunmark-on-white`,
    src.includes('icon-sunmark-on-white.png')
  )
  assert(
    `${file}: uses img for mark`,
    /<img[\s\S]*?(?:logo-mark|logo-icon|brand-logo)/.test(src)
  )
}

assert(
  'PlatformDesktopLogo keeps aria-label on link',
  read('src/components/platform/PlatformDesktopNav.jsx').includes('aria-label="Главная"')
)

const offline = read('public/offline.html')
assert('offline.html: no literal S logo', !/>\s*S\s*</.test(offline) && !offline.includes('>S</'))
assert(
  'offline.html: img to pwa-icons/icon-192.png',
  /<img[\s\S]*pwa-icons\/icon-192\.png/.test(offline)
)

const cssTargets = [
  'src/layouts/PlatformLayout.css',
  'src/components/platform/PlatformSidebar.css',
  'src/pages/Login.css',
  'src/components/Sidebar.css',
  'src/components/Header.css',
]

for (const file of cssTargets) {
  const css = read(file)
  assert(
    `${file}: no green plate gradient under logo mark/icon`,
    !/(?:logo-(?:mark|icon)|brand-logo)[\s\S]{0,280}linear-gradient\(\s*135deg\s*,\s*var\(--color-primary\)/.test(
      css
    )
  )
}

console.log(`\n${checks}/${checks} checks passed`)
