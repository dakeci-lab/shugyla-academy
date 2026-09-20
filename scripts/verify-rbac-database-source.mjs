#!/usr/bin/env node
/**
 * Route access: once RBAC is loaded from the database, ticking/unticking a
 * permission in «Роли и доступы» is what decides — the role-name fallback in
 * config/permissions.js must not re-open a route that was closed. The fallback
 * only applies while permissions are unavailable (not loaded / failed).
 *
 * Usage: npm run verify:rbac-database-source
 */

import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// Vite-style sources: empty env keeps the app in local mode; localStorage is shimmed.
globalThis.__VITE_ENV__ = {}
const store = new Map()
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href)
const rbac = await load('src/services/rbacService.js')
const perms = await load('src/config/permissions.js')
const { ROUTE_KEYS, canAccessRoute, canViewOrders } = perms

let checks = 0
function assert(name, condition) {
  if (!condition) {
    console.error(`  ✗ ${name}`)
    process.exit(1)
  }
  checks += 1
  console.log(`  ✓ ${name}`)
}

console.log('Before the permissions are loaded: role fallback still works')
assert('rbac is not loaded yet', rbac.getRbacLoadState() !== rbac.RBAC_LOAD_STATE.LOADED)
assert('buyer reaches procurement by role', canAccessRoute({ role: 'buyer' }, ROUTE_KEYS.PROCUREMENT))
assert('receiver reaches orders by role', canAccessRoute({ role: 'receiver' }, ROUTE_KEYS.ORDERS))

await rbac.ensureRbacLoaded()
assert('rbac loaded', rbac.getRbacLoadState() === rbac.RBAC_LOAD_STATE.LOADED)

console.log('After loading: the database decides')
const cache = rbac.getRbacCache()
const buyerRole = cache.roles.find((role) => role.code === 'buyer')
const buyer = { role: 'buyer', roleId: buyerRole.id }
assert('buyer keeps procurement while the permission is granted', canAccessRoute(buyer, ROUTE_KEYS.PROCUREMENT))

const procurementView = cache.permissions.find((perm) => perm.code === 'procurement.view')
const receivingView = cache.permissions.find((perm) => perm.code === 'receiving.view')
cache.rolePermissions = cache.rolePermissions.filter(
  (rp) => !(rp.roleId === buyerRole.id && rp.permissionId === procurementView.id)
)
assert('unticking procurement.view closes «Закуп» even for the buyer role', !canAccessRoute(buyer, ROUTE_KEYS.PROCUREMENT))
assert('the buyer still sees orders through receiving.view', canViewOrders(buyer) === Boolean(
  cache.rolePermissions.some((rp) => rp.roleId === buyerRole.id && rp.permissionId === receivingView.id)
))

console.log('Menu groups follow their children')
const cashierRole = cache.roles.find((role) => role.code === 'cashier')
const cashier = { role: 'cashier', roleId: cashierRole.id }
assert('cashier (own schedule only) still sees the «Сотрудники» group', canAccessRoute(cashier, ROUTE_KEYS.EMPLOYEES_GROUP))
assert('cashier does not see the «Закупки» group', !canAccessRoute(cashier, ROUTE_KEYS.PROCUREMENT_GROUP))
assert('cashier does not see orders', !canViewOrders(cashier))

console.log(`\nVerification completed (${checks} checks, exit 0)\n`)
