#!/usr/bin/env node
/**
 * Verification for supplier edit form focus stability (no remount on keystroke).
 *
 * Usage:
 *   npm run verify:supplier-form-focus
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let testsRun = 0
let testsPassed = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  testsRun += 1
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function main() {
  console.log('=== Supplier form focus verification ===\n')

  const page = read('src/pages/platform/suppliers/SuppliersPage.jsx')
  const form = read('src/components/suppliers/SupplierForm.jsx')
  const modal = read('src/components/admin/AdminModal.jsx')

  console.log('Stage 1: Stable keys and structure')

  assert('no form key from formData', !page.includes('key={JSON.stringify(form') && !page.includes('key={form'))
  assert('no modal key from formData', !page.match(/AdminModal[\s\S]*key=\{/))
  assert('SupplierForm is imported component', page.includes("import SupplierForm"))
  assert('no nested SupplierForm in render', !page.match(/function SuppliersListPage[\s\S]*function SupplierForm/))
  assert('editId state is stable identifier', page.includes('editId'))

  console.log('Stage 2: Local form state')

  assert('form state via useState', page.includes('useState(EMPTY_SUPPLIER_FORM)'))
  assert('onChange uses setForm', page.includes('onChange={setForm}'))
  assert('SupplierForm setField spreads form', form.includes('onChange({ ...form, [field]: value })'))
  assert('inputs are controlled strings', form.includes('value={form.name}'))
  assert('no supplier sync effect in SupplierForm', !form.includes('useEffect'))

  console.log('Stage 3: Modal stability')

  assert('closeForm is useCallback', page.includes('const closeForm = useCallback'))
  assert('modal footer memoized', page.includes('const modalFooter = useMemo'))
  assert('AdminModal onClose uses ref', modal.includes('onCloseRef'))
  assert('focus effect not tied to onClose', !modal.includes('}, [onClose'))
  assert('initial focus isolated effect', modal.includes('autoFocusClose'))
  assert('supplier modal disables auto focus close', page.includes('autoFocusClose={false}'))

  console.log('Stage 4: No list refresh on keypress')

  assert('suppliers list not updated in setField', !form.includes('updateSupplier'))
  assert('filter uses version not form', page.includes('[suppliers, search, appliedStatus, version]'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
