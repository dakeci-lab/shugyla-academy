import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getBaseUrl } from './helpers/env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const suite = process.env.E2E_SUITE || 'mutating'
const testMatch =
  suite === 'smoke'
    ? /recruitment-production-smoke\.spec\.(mjs|js|ts)/
    : /recruitment-flexible-form\.spec\.(mjs|js|ts)/

export default defineConfig({
  testDir: __dirname,
  testMatch,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  globalSetup: path.resolve(__dirname, 'global-setup.mjs'),
  globalTeardown: path.resolve(__dirname, 'global-teardown.mjs'),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.resolve(__dirname, '../../playwright-report/recruitment') }],
  ],
  outputDir: path.resolve(__dirname, '../../test-results/e2e-recruitment'),
  use: {
    baseURL: getBaseUrl(),
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: false,
    locale: 'ru-RU',
  },
  projects: [
    {
      name: 'recruitment-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
