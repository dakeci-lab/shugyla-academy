/**
 * Импорт поставщиков из Umag Excel → JSON seed + SQL migration
 * Запуск: node scripts/import-suppliers-from-umag.mjs [path-to-xlsx]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const DEFAULT_XLSX =
  '/Users/daniyarsultanbay/Downloads/Список поставщиков_export_09.07.2026 14_34.xlsx'

const OUT_JSON = path.join(ROOT, 'src/data/umagSuppliersSeed.json')
const OUT_SQL = path.join(ROOT, 'supabase/migrations/seed_umag_suppliers.sql')

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function findColumnKey(row, variants) {
  const keys = Object.keys(row)
  for (const key of keys) {
    const n = normalizeHeader(key)
    if (variants.some((v) => n === v || n.includes(v))) return key
  }
  return null
}

function buildComment({ type, iin, address, store }) {
  const parts = []
  if (type?.trim()) parts.push(`Тип: ${type.trim()}`)
  if (iin?.trim()) parts.push(`ИИН/БИН: ${iin.trim()}`)
  if (store?.trim()) parts.push(`Магазин: ${store.trim()}`)
  if (address?.trim()) parts.push(`Адрес: ${address.trim()}`)
  return parts.join('\n')
}

function escapeSql(str) {
  if (str == null) return ''
  return String(str).replace(/'/g, "''")
}

function mapRow(row) {
  const nameKey = findColumnKey(row, ['наименование'])
  const legalKey = findColumnKey(row, ['полное наименование'])
  const phoneKey = findColumnKey(row, ['контактная информация', 'контакт'])
  const addressKey = findColumnKey(row, ['адрес'])
  const typeKey = findColumnKey(row, ['тип'])
  const iinKey = findColumnKey(row, ['иин/бин', 'иин', 'бин'])
  const storeKey = findColumnKey(row, ['магазин'])

  const name = String(row[nameKey] ?? '').trim()
  if (!name) return null

  const legalName = String(row[legalKey] ?? '').trim()
  const managerPhone = String(row[phoneKey] ?? '').trim()
  const address = String(row[addressKey] ?? '').trim()
  const type = String(row[typeKey] ?? '').trim()
  const iin = String(row[iinKey] ?? '').trim()
  const store = String(row[storeKey] ?? '').trim()

  return {
    name,
    legal_name: legalName || null,
    product_categories: [],
    manager_name: '',
    manager_phone: managerPhone,
    whatsapp: null,
    order_days: '',
    delivery_days: '',
    min_order_amount: 0,
    payment_type: 'cash',
    deferral_days: 0,
    return_policy: 'no',
    return_comment: null,
    responsible_employee_id: null,
    responsible_employee_name: null,
    status: 'active',
    comment: buildComment({ type, iin, address, store }) || null,
  }
}

function dedupeByName(suppliers) {
  const seen = new Set()
  const result = []
  for (const s of suppliers) {
    const key = s.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(s)
  }
  return result
}

function main() {
  const xlsxPath = process.argv[2] || DEFAULT_XLSX
  if (!fs.existsSync(xlsxPath)) {
    console.error('File not found:', xlsxPath)
    process.exit(1)
  }

  const workbook = XLSX.readFile(xlsxPath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  const mapped = rows.map(mapRow).filter(Boolean)
  const suppliers = dedupeByName(mapped)

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true })
  fs.writeFileSync(OUT_JSON, JSON.stringify(suppliers, null, 2), 'utf8')

  const sqlLines = [
    '-- Seed поставщиков из Umag export',
    '-- Дубликаты по name пропускаются',
    '',
  ]

  for (const s of suppliers) {
    const categories = '{}'
    sqlLines.push(`INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  '${escapeSql(s.name)}',
  ${s.legal_name ? `'${escapeSql(s.legal_name)}'` : 'NULL'},
  '${categories}',
  '',
  '${escapeSql(s.manager_phone)}',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  ${s.comment ? `'${escapeSql(s.comment)}'` : 'NULL'}
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('${escapeSql(s.name)}'))
);`)
    sqlLines.push('')
  }

  fs.writeFileSync(OUT_SQL, sqlLines.join('\n'), 'utf8')

  console.log(`Parsed ${rows.length} rows, imported ${suppliers.length} unique suppliers`)
  console.log('JSON:', OUT_JSON)
  console.log('SQL:', OUT_SQL)
}

main()
