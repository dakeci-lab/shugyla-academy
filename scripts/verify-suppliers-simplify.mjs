#!/usr/bin/env node
/**
 * Verification for simplified supplier cards and form.
 *
 * Usage:
 *   npm run verify:suppliers-simplify
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
  console.log('=== Suppliers simplify verification ===\n')

  const table = read('src/components/suppliers/SupplierTable.jsx')
  const tableCss = read('src/components/suppliers/SupplierTable.css')
  const form = read('src/components/suppliers/SupplierForm.jsx')
  const page = read('src/pages/platform/suppliers/SuppliersPage.jsx')
  const supplierData = read('src/utils/supplierData.js')

  console.log('Stage 1: Mobile cards')

  assert('mobile card no orderDays field', !table.match(/supplier-cards[\s\S]*orderDays/))
  assert('mobile card no deliveryDays field', !table.match(/supplier-cards[\s\S]*deliveryDays/))
  assert('mobile card no eye icon', !table.includes('EyeIcon'))
  assert('mobile card no trash icon', !table.includes('TrashIcon'))
  assert('mobile card no action footer', !table.includes('supplier-card-item__actions'))
  assert('mobile card clickable role', table.includes("role: 'button'"))
  assert('mobile card keyboard support', table.includes("event.key === 'Enter'"))
  assert('mobile card edit aria label', table.includes('Редактировать поставщика'))
  assert('mobile card compact padding', tableCss.includes('padding: 12px 14px'))

  console.log('Stage 2: Desktop actions')

  assert('desktop edit action preserved', table.includes('PencilIcon'))
  assert('desktop no view action', !table.includes('Просмотр'))
  assert('desktop no delete in row', !table.includes('onDeactivate'))
  assert('desktop no navigate to detail', !table.includes('navigate(`/platform/suppliers/'))

  console.log('Stage 3: Edit modal delete')

  assert('edit modal delete button', page.includes('Удалить поставщика'))
  assert('delete uses ConfirmDialog', page.includes('ConfirmDialog'))
  assert('delete uses deleteSupplier', page.includes('deleteSupplier'))
  assert('delete success toast', page.includes("showSuccess('Поставщик удалён')"))
  assert('create modal no delete button gated by editId', page.includes('{editId && canDelete &&'))

  console.log('Stage 4: Form fields removed')

  assert('form no categories', !form.includes('Категории товаров'))
  assert('form no whatsapp field', !form.includes('value={form.whatsapp}'))
  assert('form no min order', !form.includes('Минимальная сумма заказа'))
  assert('form no return policy', !form.includes('Возврат / обмен'))
  assert('form no return comment', !form.includes('Комментарий по возврату'))
  assert('form no responsible employee', !form.includes('Ответственный сотрудник'))
  assert('form no manual responsible', !form.includes('Или укажите вручную'))
  assert('form no general comment', !form.includes('Общий комментарий'))

  console.log('Stage 5: Form fields kept')

  assert('form keeps name', form.includes('Название поставщика'))
  assert('form keeps legal name', form.includes('Юридическое название'))
  assert('form keeps manager name', form.includes('Имя менеджера'))
  assert('form keeps manager phone', form.includes('Телефон менеджера'))
  assert('form keeps order days', form.includes('Дни заказа'))
  assert('form keeps delivery days', form.includes('Дни поставки'))
  assert('form keeps payment type', form.includes('Условия оплаты'))
  assert('form keeps deferral days', form.includes('Срок отсрочки'))
  assert('form keeps status', form.includes('Статус'))

  console.log('Stage 6: Payload whitelist')

  assert('create payload helper', form.includes('formToSupplierCreatePayload'))
  assert('update payload helper', form.includes('formToSupplierUpdatePayload'))
  assert('update uses patch helper in page', page.includes('formToSupplierUpdatePayload'))
  assert('create uses create helper in page', page.includes('formToSupplierCreatePayload'))
  assert('payload excludes categories', !form.match(/buildVisibleSupplierPayload[\s\S]*productCategories/))
  assert('payload excludes whatsapp', !form.match(/buildVisibleSupplierPayload[\s\S]*whatsapp/))
  assert('categories garbage filter', supplierData.includes('isGarbageCategory'))
  assert('view component removed', !fs.existsSync(path.join(ROOT, 'src/components/suppliers/SupplierDetails.jsx')))
  assert('detail route redirects to edit', page.includes('openEditId: id'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
