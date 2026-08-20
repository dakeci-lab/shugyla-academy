#!/usr/bin/env node
/**
 * Alias: PR A bridge replaced by in-table tree verifies (PR B).
 *
 * Usage:
 *   npm run verify:procurement-planner-categories
 */

import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
await import(pathToFileURL(path.join(__dirname, 'verify-procurement-planner-tree.mjs')).href)
