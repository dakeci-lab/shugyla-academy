#!/usr/bin/env node
/**
 * Sunmark S3: corporate + Apply success on-white.
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

