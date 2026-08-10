#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
let count = 0

function assert(name, condition) {
  count += 1
  if (!condition) throw new Error(`FAIL: ${name}`)
  console.log(`  ✓ ${name}`)
}

const model = await import(
  pathToFileURL(path.join(ROOT, 'src/components/procurement/procurementNormsModel.js')).href
)

const hierarchy = model.buildProcurementNormHierarchy({
  taxonomy: [
    { categoryName: 'Food', subcategoryName: 'Milk' },
    { categoryName: 'Food', subcategoryName: 'Bread' },
    { categoryName: 'Home', subcategoryName: 'Clean' },
  ],
  rules: [
    { categoryName: 'Food', subcategoryName: '', normDays: 12 },
    { categoryName: 'Food', subcategoryName: 'Milk', normDays: 5 },
  ],
})

assert('builds two category groups', hierarchy.length === 2)
const food = hierarchy.find((item) => item.categoryName === 'Food')
assert('category rule is applied', food.normDays === 12)
assert('subcategory override wins', food.subcategories.find((item) => item.subcategoryName === 'Milk').normDays === 5)
assert('subcategory override is marked', food.subcategories.find((item) => item.subcategoryName === 'Milk').hasOverride)
assert('missing override inherits category', food.subcategories.find((item) => item.subcategoryName === 'Bread').normDays === 12)

const changed = model.applyCategoryNormToHierarchy(hierarchy, 'Food', 20)
const changedFood = changed.find((item) => item.categoryName === 'Food')
assert('category update changes inherited subcategory', changedFood.subcategories.find((item) => item.subcategoryName === 'Bread').normDays === 20)
assert('category update preserves explicit override', changedFood.subcategories.find((item) => item.subcategoryName === 'Milk').normDays === 5)

const overridden = model.applySubcategoryNormToHierarchy(changed, 'Food', 'Bread', 9)
assert('subcategory edit creates override', overridden.find((item) => item.categoryName === 'Food').subcategories.find((item) => item.subcategoryName === 'Bread').hasOverride)
assert('subcategory edit stores exact value', overridden.find((item) => item.categoryName === 'Food').subcategories.find((item) => item.subcategoryName === 'Bread').normDays === 9)

assert('category search keeps full category', model.filterProcurementNormHierarchy(hierarchy, 'food')[0].subcategories.length === 2)
assert('subcategory search keeps matching child only', model.filterProcurementNormHierarchy(hierarchy, 'milk')[0].subcategories.length === 1)

const component = fs.readFileSync(path.join(ROOT, 'src/components/procurement/ProcurementNormsView.jsx'), 'utf8')
const service = fs.readFileSync(path.join(ROOT, 'src/services/procurementNormsService.js'), 'utf8')
assert('component has accessible accordion', component.includes('aria-expanded={open}') && component.includes('aria-controls={panelId}'))
assert('component autosaves input', component.includes('AUTO_SAVE_DELAY_MS') && component.includes('onBlur'))
assert('generated snapshot is read-only', component.includes("snapshot?.status === 'generated'") && component.includes("snapshot?.status === 'ready'"))
assert('partially generated snapshot stays editable', component.includes("snapshot?.status === 'partially_generated'"))
assert('norm writes use existing set_norm service path', service.includes('persistNormDaysForScope'))
assert('category save reapplies subcategory overrides', service.includes('overridesApplied') && service.includes('for (const override of overrides)'))

console.log(`\n${count}/${count} checks passed`)
