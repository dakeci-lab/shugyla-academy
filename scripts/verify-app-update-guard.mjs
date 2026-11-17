#!/usr/bin/env node
/**
 * Verification — a tab left open reloads itself when a newer version is deployed (2026-11-17).
 *
 * Usage: npm run verify:app-update-guard
 */
import fs from 'fs'
import path from 'path'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}

const { isNewerVersionDeployed, isUserBusy, fetchDeployedCommit } = await import(
  pathToFileURL(path.join(ROOT, 'src/hooks/useAppUpdateGuard.js')).href
)

assert.equal(isNewerVersionDeployed('bbb', 'aaa'), true)
assert.equal(isNewerVersionDeployed('aaa', 'aaa'), false)
assert.equal(isNewerVersionDeployed(null, 'aaa'), false)
assert.equal(isNewerVersionDeployed('local', 'aaa'), false)
assert.equal(isNewerVersionDeployed('bbb', 'local'), false)
ok('a different deployed commit means a newer version; the same one, an unknown one and dev builds («local») never trigger a reload')

const fakeFetch = (body, okStatus = true) => async () => ({ ok: okStatus, json: async () => body })
assert.equal(await fetchDeployedCommit(fakeFetch({ commit: 'abc123', base: '/' })), 'abc123')
assert.equal(await fetchDeployedCommit(fakeFetch({ base: '/' })), null)
assert.equal(await fetchDeployedCommit(fakeFetch({}, false)), null)
assert.equal(await fetchDeployedCommit(async () => { throw new Error('offline') }), null)
ok('version.json is read without cache; offline, a broken answer or a missing commit just mean «no update»')

const doc = (active, dialog = false) => ({
  body: {},
  activeElement: active,
  querySelector: () => (dialog ? {} : null),
})
const input = { matches: (sel) => sel.includes('input') }
const plain = { matches: () => false }
assert.equal(isUserBusy(doc(input)), true)
assert.equal(isUserBusy(doc(plain)), false)
assert.equal(isUserBusy(doc(plain, true)), true)
ok('the tab does not reload under the user: a focused field or an open dialog make it wait')

const hook = read('src/hooks/useAppUpdateGuard.js')
assert.match(hook, /\{ cache: 'no-store' \}/)
assert.match(hook, /document\.addEventListener\('visibilitychange', onVisible\)/)
assert.match(hook, /RELOAD_GUARD_MS = 2 \* 60 \* 1000/)
assert.match(hook, /if \(BUILD_COMMIT === 'local'\) return undefined/)
assert.match(read('src/layouts/PlatformLayout.jsx'), /useAppUpdateGuard\(\)/)
const vite = read('vite.config.js')
assert.match(vite, /__APP_COMMIT__: JSON\.stringify\(appCommit\)/)
assert.match(vite, /commit: appCommit,/)
ok('the build commit is compiled into the app and written to version.json; the platform layout runs the guard; no second reload within 2 minutes')

console.log(`\n${checks} checks passed`)
