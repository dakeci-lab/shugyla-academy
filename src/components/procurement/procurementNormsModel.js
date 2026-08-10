import { DEFAULT_NORM_DAYS, parseNormDays } from '../../utils/procurementPlanningMath.js'

const EMPTY_CATEGORY_LABEL = 'Без категории'
const EMPTY_SUBCATEGORY_LABEL = 'Без подкатегории'

function normKey(categoryName, subcategoryName = '') {
  return `${categoryName || ''}\u0000${subcategoryName || ''}`
}

export function normalizeProcurementNormSearch(value) {
  return String(value || '').trim().toLocaleLowerCase('ru')
}

/**
 * Build the category -> subcategory view model from the latest UMAG snapshot.
 * A missing subcategory rule inherits the category norm.
 */
export function buildProcurementNormHierarchy({ taxonomy = [], rules = [] } = {}) {
  const ruleMap = new Map(
    (rules || []).map((rule) => [
      normKey(rule.categoryName ?? rule.category_name, rule.subcategoryName ?? rule.subcategory_name),
      parseNormDays(rule.normDays ?? rule.norm_days),
    ])
  )
  const categoryMap = new Map()

  for (const item of taxonomy || []) {
    const categoryName = item.categoryName ?? item.category_name ?? ''
    const subcategoryName = item.subcategoryName ?? item.subcategory_name ?? ''
    if (!categoryMap.has(categoryName)) categoryMap.set(categoryName, new Set())
    if (subcategoryName) categoryMap.get(categoryName).add(subcategoryName)
  }

  return [...categoryMap.entries()]
    .map(([categoryName, subcategoryNames]) => {
      const categoryRuleKey = normKey(categoryName)
      const hasCategoryRule = ruleMap.has(categoryRuleKey)
      const categoryNormDays = hasCategoryRule
        ? ruleMap.get(categoryRuleKey)
        : DEFAULT_NORM_DAYS

      const subcategories = [...subcategoryNames]
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .map((subcategoryName) => {
          const subcategoryRuleKey = normKey(categoryName, subcategoryName)
          const hasOverride = ruleMap.has(subcategoryRuleKey)
          return {
            categoryName,
            subcategoryName,
            label: subcategoryName || EMPTY_SUBCATEGORY_LABEL,
            normDays: hasOverride ? ruleMap.get(subcategoryRuleKey) : categoryNormDays,
            hasOverride,
          }
        })

      return {
        categoryName,
        label: categoryName || EMPTY_CATEGORY_LABEL,
        normDays: categoryNormDays,
        hasCategoryRule,
        subcategories,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
}

export function filterProcurementNormHierarchy(hierarchy = [], search = '') {
  const query = normalizeProcurementNormSearch(search)
  if (!query) return hierarchy

  return hierarchy.flatMap((category) => {
    if (normalizeProcurementNormSearch(category.label).includes(query)) return [category]
    const subcategories = category.subcategories.filter((subcategory) =>
      normalizeProcurementNormSearch(subcategory.label).includes(query)
    )
    return subcategories.length ? [{ ...category, subcategories }] : []
  })
}

/** Preserve explicit subcategory overrides when the category default changes. */
export function applyCategoryNormToHierarchy(hierarchy = [], categoryName, normDays) {
  const days = parseNormDays(normDays)
  return hierarchy.map((category) => {
    if (category.categoryName !== categoryName) return category
    return {
      ...category,
      normDays: days,
      hasCategoryRule: true,
      subcategories: category.subcategories.map((subcategory) =>
        subcategory.hasOverride ? subcategory : { ...subcategory, normDays: days }
      ),
    }
  })
}

export function applySubcategoryNormToHierarchy(
  hierarchy = [],
  categoryName,
  subcategoryName,
  normDays
) {
  const days = parseNormDays(normDays)
  return hierarchy.map((category) => {
    if (category.categoryName !== categoryName) return category
    return {
      ...category,
      subcategories: category.subcategories.map((subcategory) =>
        subcategory.subcategoryName === subcategoryName
          ? { ...subcategory, normDays: days, hasOverride: true }
          : subcategory
      ),
    }
  })
}
