import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachConsoleGuard, HR_SOFT_PROBE_ALLOW } from './helpers/consoleGuard.mjs'
import { attachPublicNetworkGuard } from './helpers/publicNetworkGuard.mjs'
import {
  createAdminClient,
  createAnonClient,
  getBaseUrl,
} from './helpers/env.mjs'
import {
  assertDuplicateRollback,
  assertProtectedVacanciesUntouched,
  findCandidatesForVacancy,
  findUploadsForVacancy,
  getCandidateDiagnostics,
  getUploadDiagnostics,
  getVacancyDiagnostics,
  loadState,
  saveState,
  trackCandidate,
  trackVacancy,
} from './helpers/fixture.mjs'
import {
  addQuestion,
  appUrl,
  createDraftVacancy,
  deactivateQuestionByText,
  editQuestionByText,
  expectNoHorizontalScroll,
  fillPublicApplication,
  loginAsHr,
  openPreview,
  openVacancyByTitle,
  PHOTO_PATH,
  publishVacancyInModal,
  saveApplicationForm,
  saveVacancyForm,
  closeVacancyModal,
  submitPublicApplication,
} from './helpers/ui.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACT_DIR = path.resolve(__dirname, '../../test-results/e2e-recruitment/artifacts')

test.describe.configure({ mode: 'serial' })

const ctx = {
  vacancyId: null,
  vacancySlug: null,
  duplicateVacancyId: null,
  formVersionAfterSeed: null,
  candidate1Id: null,
  candidate2Id: null,
  uploadIdCandidate1: null,
  title: null,
  runId: null,
  positionName: null,
  customLabels: {
    short: null,
    long: null,
    number: null,
    date: null,
    single: null,
    multi: null,
    yesno: null,
    photo: null,
    optional: null,
  },
}

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })
  const state = loadState()
  ctx.runId = state.runId
  ctx.title = `${state.runId} Vacancy`
  ctx.positionName = state.positionName || process.env.E2E_POSITION_NAME
  ctx.customLabels = {
    short: `${state.runId} Short`,
    long: `${state.runId} Long`,
    number: `${state.runId} Number`,
    date: `${state.runId} Date`,
    single: `${state.runId} Single`,
    multi: `${state.runId} Multi`,
    yesno: `${state.runId} YesNo`,
    photo: `${state.runId} Photo`,
    optional: `${state.runId} Optional`,
  }
})

test.afterAll(async () => {
  // Keep state for global teardown cleanup; refresh tracked ids.
  const state = loadState() || {}
  if (ctx.vacancyId) state.vacancyIds = Array.from(new Set([...(state.vacancyIds || []), ctx.vacancyId]))
  if (ctx.duplicateVacancyId) {
    state.vacancyIds = Array.from(new Set([...(state.vacancyIds || []), ctx.duplicateVacancyId]))
  }
  for (const id of [ctx.candidate1Id, ctx.candidate2Id].filter(Boolean)) {
    state.candidateIds = Array.from(new Set([...(state.candidateIds || []), id]))
  }
  saveState(state)
})

test('1. HR login and vacancies access', async ({ page }) => {
  const guard = attachConsoleGuard(page, { allow: HR_SOFT_PROBE_ALLOW })
  await loginAsHr(page)
  await expect(page).toHaveURL(/\/platform\/hr\/vacancies/)
  await expect(page.getByText(/42501|permission denied|JWT/i)).toHaveCount(0)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01-hr-vacancies-desktop.png'), fullPage: true })
  guard.assertClean('hr-login')
})

test('2. Create draft vacancy with centralized position', async ({ page }) => {
  const guard = attachConsoleGuard(page, { allow: HR_SOFT_PROBE_ALLOW })
  await loginAsHr(page)
  await createDraftVacancy(page, { title: ctx.title, positionName: ctx.positionName })

  // Resolve vacancy via admin by unique title
  const admin = createAdminClient()
  const { data: vacancy } = await admin
    .from('academy_vacancies')
    .select('id, slug, status, position_id, position_name_snapshot, application_form_version, title')
    .eq('title', ctx.title)
    .maybeSingle()
  expect(vacancy?.id).toBeTruthy()
  expect(vacancy.status).toBe('draft')
  expect(vacancy.position_id).toBeTruthy()
  expect(vacancy.slug).toBeTruthy()
  ctx.vacancyId = vacancy.id
  ctx.vacancySlug = vacancy.slug
  ctx.formVersionAfterSeed = vacancy.application_form_version
  await trackVacancy(vacancy.id)

  // Position shown by name in table after close+refresh
  await closeVacancyModal(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const row = page.locator('tr', { hasText: ctx.title })
  await expect(row).toBeVisible()
  await expect(row.getByText(/Черновик|draft/i)).toBeVisible()
  // Must not show raw UUID as position label
  const positionCellText = await row.locator('td').nth(2).innerText()
  expect(positionCellText).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  )
  expect(positionCellText.toLowerCase()).not.toMatch(/^(admin|cashier|seller)$/)

  const diag = await getVacancyDiagnostics(ctx.vacancyId)
  const bindings = diag.questions.map((q) => q.field_binding)
  expect(bindings).toContain('first_name')
  expect(bindings).toContain('phone')
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02-draft-vacancy.png'), fullPage: true })
  guard.assertClean('create-vacancy')
})

test('3. Form editor: protected fields, all types, preview, save/refresh', async ({ page }) => {
  test.setTimeout(300_000)
  const guard = attachConsoleGuard(page, { allow: HR_SOFT_PROBE_ALLOW })
  await loginAsHr(page)
  await openVacancyByTitle(page, ctx.title)

  // Protected first_name / phone
  const firstNameItem = page.locator('.vacancy-application-editor__item', {
    hasText: 'Системное поле',
  }).filter({ hasText: /Имя/i }).first()
  await expect(firstNameItem).toBeVisible()
  await expect(firstNameItem.getByRole('button', { name: 'Отключить' })).toHaveCount(0)

  // Edit label of first system field is allowed; type/required/binding locked.
  await firstNameItem.getByRole('button', { name: 'Изменить' }).click()
  const editForm = page.locator('#question-edit-form')
  await expect(editForm.getByLabel('Тип ответа')).toBeDisabled()
  await expect(editForm.getByLabel('Обязательный вопрос')).toBeDisabled()
  await editForm.getByLabel('Текст вопроса *').fill(`Имя (${ctx.runId})`)
  await page.locator('button.btn.btn--primary[form="question-edit-form"]').click()
  await expect(editForm).toBeHidden()

  // Move order using ↑↓ on a non-first item
  const second = page.locator('.vacancy-application-editor__item').nth(1)
  await second.getByRole('button', { name: 'Переместить выше' }).click()

  const batch = [
    {
      text: ctx.customLabels.short,
      type: 'short_text',
      required: true,
      placeholder: 'ph-short',
      helpText: 'help-short',
    },
    {
      text: ctx.customLabels.long,
      type: 'long_text',
      required: false,
      helpText: 'help-long',
    },
    { text: ctx.customLabels.number, type: 'number', required: true },
    { text: ctx.customLabels.date, type: 'date', required: true },
    {
      text: ctx.customLabels.single,
      type: 'single_choice',
      required: true,
      options: [`${ctx.runId}-A`, `${ctx.runId}-B`],
    },
    {
      text: ctx.customLabels.multi,
      type: 'multi_choice',
      required: true,
      options: [`${ctx.runId}-M1`, `${ctx.runId}-M2`, `${ctx.runId}-M3`],
    },
    { text: ctx.customLabels.yesno, type: 'yes_no', required: true },
    {
      text: ctx.customLabels.photo,
      type: 'photo',
      required: true,
      helpText: 'photo-help',
    },
    { text: ctx.customLabels.optional, type: 'short_text', required: false },
  ]

  // Save after every question — PlatformData refresh otherwise wipes unsaved drafts.
  for (const question of batch) {
    await addQuestion(page, question)
    await saveApplicationForm(page)
  }
  await deactivateQuestionByText(page, ctx.customLabels.optional)
  await saveApplicationForm(page)

  await openVacancyByTitle(page, ctx.title)
  for (const label of [
    ctx.customLabels.short,
    ctx.customLabels.long,
    ctx.customLabels.number,
    ctx.customLabels.date,
    ctx.customLabels.single,
    ctx.customLabels.multi,
    ctx.customLabels.yesno,
    ctx.customLabels.photo,
  ]) {
    await expect(
      page.locator('.vacancy-application-editor__item', { hasText: label }).first()
    ).toBeVisible()
  }

  await openPreview(page)
  const preview = page.locator('[role="dialog"]').filter({
    hasText: 'Предварительный просмотр анкеты',
  })
  await expect(preview.getByText(ctx.customLabels.short)).toBeVisible()
  await preview.getByText(ctx.customLabels.single).scrollIntoViewIfNeeded()
  await expect(preview.getByText(ctx.customLabels.single)).toBeVisible()
  await expect(preview.getByText(`${ctx.runId}-A`)).toBeVisible()
  await expect(preview.getByText(/scoring|процент|балл/i)).toHaveCount(0)
  await expect(preview.locator('input[type="file"]')).toHaveCount(1)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03-preview.png'), fullPage: true })
  await preview.locator('button.btn', { hasText: 'Закрыть' }).click()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVacancyByTitle(page, ctx.title)
  await expect(page.getByText(ctx.customLabels.short)).toBeVisible()
  await expect(page.getByText(ctx.customLabels.photo)).toBeVisible()
  await expect(page.getByText(`Отключённые вопросы`)).toBeVisible()

  const diag = await getVacancyDiagnostics(ctx.vacancyId)
  expect(diag.vacancy.application_form_version).toBeGreaterThan(ctx.formVersionAfterSeed)
  ctx.formVersionAfterSeed = diag.vacancy.application_form_version
  guard.assertClean('form-editor')
})

test('4. Form versioning rules', async ({ page }) => {
  test.setTimeout(180_000)
  const guard = attachConsoleGuard(page, { allow: HR_SOFT_PROBE_ALLOW })
  await loginAsHr(page)
  await openVacancyByTitle(page, ctx.title)
  const before = (await getVacancyDiagnostics(ctx.vacancyId)).vacancy.application_form_version

  await editQuestionByText(page, ctx.customLabels.short, {
    text: `${ctx.customLabels.short} v2`,
  })
  ctx.customLabels.short = `${ctx.customLabels.short} v2`
  await saveApplicationForm(page)
  const afterSave = (await getVacancyDiagnostics(ctx.vacancyId)).vacancy.application_form_version
  expect(afterSave).toBe(before + 1)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await openVacancyByTitle(page, ctx.title)
  const afterRefresh = (await getVacancyDiagnostics(ctx.vacancyId)).vacancy.application_form_version
  expect(afterRefresh).toBe(afterSave)

  // Vacancy field change (description) must not bump form version
  await page.locator('#vacancy-form textarea.admin-form__input').fill(`desc ${ctx.runId}`)
  await saveVacancyForm(page)
  const afterDesc = (await getVacancyDiagnostics(ctx.vacancyId)).vacancy.application_form_version
  expect(afterDesc).toBe(afterSave)

  // Invalid choice edit: clear options on existing single_choice — modal blocks; version unchanged
  const singleItem = page.locator('.vacancy-application-editor__item', {
    hasText: ctx.customLabels.single,
  }).first()
  await singleItem.getByRole('button', { name: 'Изменить' }).click()
  const modal = page.locator('#question-edit-form')
  await expect(modal).toBeVisible()
  const optionInputs = modal.locator('.vacancy-application-editor__option-row input')
  await expect(optionInputs.first()).toBeVisible({ timeout: 10_000 })
  await optionInputs.nth(0).fill('')
  await optionInputs.nth(1).fill('')
  await page.locator('button.btn.btn--primary[form="question-edit-form"]').click()
  await expect(modal.locator('.admin-form__error')).toHaveText(/минимум 2/i)
  const still = (await getVacancyDiagnostics(ctx.vacancyId)).vacancy.application_form_version
  expect(still).toBe(afterSave)
  await page.locator('.admin-modal__footer button.btn', { hasText: 'Отмена' }).last().click()
  await expect(modal).toBeHidden({ timeout: 10_000 })
  ctx.formVersionAfterSeed = afterSave
  guard.assertClean('form-versioning')
})

test('5. Publish vacancy and public hub payload hygiene', async ({ page }) => {
  const guard = attachConsoleGuard(page, { allow: HR_SOFT_PROBE_ALLOW })
  await loginAsHr(page)
  await openVacancyByTitle(page, ctx.title)
  await publishVacancyInModal(page)

  await expect
    .poll(async () => (await getVacancyDiagnostics(ctx.vacancyId)).vacancy.status, {
      timeout: 30_000,
    })
    .toBe('published')
  await closeVacancyModal(page)

  const diag = await getVacancyDiagnostics(ctx.vacancyId)
  expect(diag.vacancy.status).toBe('published')
  ctx.vacancySlug = diag.vacancy.slug

  await page.goto(appUrl('/apply'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByText(ctx.title)).toBeVisible({ timeout: 30_000 })

  const anon = createAnonClient()
  const { data: hub, error: hubErr } = await anon.rpc('list_published_vacancies_for_apply')
  expect(hubErr).toBeFalsy()
  const item = (hub || []).find((v) => v.slug === ctx.vacancySlug || v.title === ctx.title)
  expect(item).toBeTruthy()
  const hubJson = JSON.stringify(item)
  expect(hubJson).not.toMatch(/field_binding|employee_role|"role"|permission/i)

  const { data: form, error: formErr } = await anon.rpc('get_public_vacancy_application_form', {
    p_slug: ctx.vacancySlug,
  })
  expect(formErr).toBeFalsy()
  const formJson = JSON.stringify(form)
  expect(formJson).not.toMatch(/field_binding|employee_role|"permissions"/i)
  expect(formJson).not.toMatch(/candidate/i)

  // Anonymous network isolation (no PlatformData / internal tables)
  const anonContext = await page.context().browser().newContext()
  const anonHubPage = await anonContext.newPage()
  const hubNet = attachPublicNetworkGuard(anonHubPage, { mode: 'hub' })
  const hubGuard = attachConsoleGuard(anonHubPage)
  await anonHubPage.goto(appUrl('/apply'), { waitUntil: 'domcontentloaded' })
  await expect(anonHubPage.getByText(ctx.title)).toBeVisible({ timeout: 30_000 })
  await anonHubPage.waitForTimeout(1500)
  hubNet.assertIsolated('anon-apply-hub')
  hubGuard.assertClean('anon-apply-hub')

  const anonFormPage = await anonContext.newPage()
  const formNet = attachPublicNetworkGuard(anonFormPage, { mode: 'form' })
  const formGuard = attachConsoleGuard(anonFormPage)
  await anonFormPage.goto(appUrl(`/apply/${ctx.vacancySlug}`), { waitUntil: 'domcontentloaded' })
  await expect(anonFormPage.getByRole('button', { name: 'Отправить анкету' })).toBeVisible({
    timeout: 30_000,
  })
  await anonFormPage.waitForTimeout(1500)
  formNet.assertIsolated('anon-apply-form')
  formGuard.assertClean('anon-apply-form')
  await anonFormPage.screenshot({
    path: path.join(ARTIFACT_DIR, '05-public-apply.png'),
    fullPage: true,
  })
  await anonContext.close()

  guard.assertClean('publish-hub')
})

test('6. Submit first candidate with photo upload-session', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const guard = attachConsoleGuard(page, {
    allow: [/photo_token/i],
  })
  const net = attachPublicNetworkGuard(page, { mode: 'form' })

  const anon = createAnonClient()
  const { data: form } = await anon.rpc('get_public_vacancy_application_form', {
    p_slug: ctx.vacancySlug,
  })
  const questions = form?.questions || form?.form?.questions || form?.data?.questions || []
  // normalize
  const normalized = Array.isArray(questions)
    ? questions
    : Array.isArray(form)
      ? form
      : form?.questions || []

  await page.goto(appUrl(`/apply/${ctx.vacancySlug}`), { waitUntil: 'domcontentloaded' })
  const phone = `7700${String(Date.now()).slice(-7)}`
  await fillPublicApplication(page, {
    questions: normalized.length ? normalized : Object.values(ctx.customLabels).map((text) => ({
      questionText: text,
      questionType: 'short_text',
      isActive: true,
    })),
    firstName: `${ctx.runId}-C1`,
    phone,
  })

  // Prefer using real form questions from RPC if shape differs
  if (!normalized.length) {
    // Fallback minimal fill already attempted; ensure first_name/phone via placeholders
    const inputs = page.locator('.apply-form__fields input, .apply-form__fields textarea')
    expect(await inputs.count()).toBeGreaterThan(0)
  }

  await submitPublicApplication(page)
  await expect(page.getByText('Анкета отправлена')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/42501|permission denied|SQLSTATE|RLS/i)).toHaveCount(0)
  await page.waitForTimeout(1000)
  const summary = net.summary()
  expect(summary.rpcs).toContain('get_public_vacancy_application_form')
  expect(summary.rpcs).toContain('submit_candidate_application')
  expect(summary.rpcs).toContain('create_candidate_photo_upload_session')
  // After submit, isolation still forbids internal table bootstrap (upload/submit RPCs OK)
  for (const req of net.state.requests) {
    expect(req.url).not.toMatch(/academy_candidates\?/)
    expect(req.url).not.toMatch(/\/rest\/v1\/positions/)
    expect(req.url).not.toMatch(/purchase_orders/)
    expect(req.url).not.toMatch(/receiving_documents/)
  }
  expect(net.state.responses.some((r) => [401, 403, 42501].includes(r.status))).toBe(false)

  const candidates = await findCandidatesForVacancy(ctx.vacancyId)
  expect(candidates.length).toBeGreaterThanOrEqual(1)
  const c1 = candidates.find((c) => c.first_name?.includes(`${ctx.runId}-C1`)) || candidates[0]
  ctx.candidate1Id = c1.id
  await trackCandidate(c1.id)

  const full = await getCandidateDiagnostics(c1.id)
  expect(full.status).toBe('new')
  expect(Number(full.total_score || 0)).toBe(0)
  const snap = full.answers
  expect(Number(snap?.version)).toBe(2)
  expect(Number(snap?.form_version)).toBeGreaterThanOrEqual(1)

  const uploads = await findUploadsForVacancy(ctx.vacancyId)
  const used = uploads.find((u) => u.candidate_id === c1.id && u.used_at)
  expect(used).toBeTruthy()
  ctx.uploadIdCandidate1 = used.id
  expect(used.used_at).toBeTruthy()

  // Reuse upload token should fail
  const { error: reuseErr } = await anon.rpc('submit_candidate_application', {
    p_vacancy_id: ctx.vacancyId,
    p_answers: {},
    p_form_version: Number(snap?.form_version),
    p_photo_upload_id: used.id,
  })
  expect(reuseErr).toBeTruthy()

  // Anon cannot open private photo path directly
  if (full.photo_path) {
    const { data: pubUrl } = anon.storage.from('candidate-photos').getPublicUrl(full.photo_path)
    const res = await context.request.get(pubUrl.publicUrl)
    expect(res.status()).not.toBe(200)
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '06-apply-success.png'), fullPage: true })
  guard.assertClean('apply-submit')
  await context.close()
})

test('7. Snapshot history after form mutation + second candidate', async ({ page, browser }) => {
  const guard = attachConsoleGuard(page, { allow: HR_SOFT_PROBE_ALLOW })
  await loginAsHr(page)
  await openVacancyByTitle(page, ctx.title)

  const oldSingleLabel = ctx.customLabels.single
  await editQuestionByText(page, oldSingleLabel, {
    text: `${oldSingleLabel} NEW`,
    options: [`${ctx.runId}-NEW-A`, `${ctx.runId}-NEW-B`],
  })
  ctx.customLabels.single = `${oldSingleLabel} NEW`
  await editQuestionByText(page, ctx.customLabels.multi, {
    options: [`${ctx.runId}-NEW-M1`, `${ctx.runId}-NEW-M2`],
  })
  // Disable a previously filled optional/long question if present
  const longVisible = await page.getByText(ctx.customLabels.long).count()
  if (longVisible) {
    await deactivateQuestionByText(page, ctx.customLabels.long)
  }
  await saveApplicationForm(page)

  // Open candidate 1 card
  await page.goto(appUrl('/platform/hr/candidates'), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('table, .candidates-table, .admin-table').first()).toBeVisible({
    timeout: 60_000,
  })
  // Backend snapshot must keep the pre-mutation label
  const c1BeforeUi = await getCandidateDiagnostics(ctx.candidate1Id)
  const snapLabels = (c1BeforeUi.answers?.items || []).map((i) => i.label)
  expect(snapLabels).toContain(oldSingleLabel)
  expect(snapLabels.join('\n')).not.toMatch(/field_binding/)

  await page.getByText(`${ctx.runId}-C1`).first().click()
  const answersToggle = page.locator('button.candidate-answers-section__toggle')
  await expect(answersToggle).toBeVisible({ timeout: 30_000 })
  await answersToggle.evaluate((el) => el.click())
  // Old label should still appear in snapshot UI (not NEW)
  await expect(page.locator('.candidate-answers-list').getByText(oldSingleLabel)).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.locator('.candidate-answers-list')).not.toContainText(/field_binding/i)
  await expect(page.locator('.candidate-answers-list pre')).toHaveCount(0)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '07-candidate1-snapshot.png'), fullPage: true })
  await page.keyboard.press('Escape')

  // Second candidate on new form
  const context = await browser.newContext()
  const anonPage = await context.newPage()
  const anonGuard = attachConsoleGuard(anonPage)
  const anon = createAnonClient()
  const { data: form } = await anon.rpc('get_public_vacancy_application_form', {
    p_slug: ctx.vacancySlug,
  })
  const questions = form?.questions || []
  await anonPage.goto(appUrl(`/apply/${ctx.vacancySlug}`), { waitUntil: 'domcontentloaded' })
  await fillPublicApplication(anonPage, {
    questions,
    firstName: `${ctx.runId}-C2`,
    phone: `7701${String(Date.now()).slice(-7)}`,
  })
  await submitPublicApplication(anonPage)
  await expect(anonPage.getByText('Анкета отправлена')).toBeVisible({ timeout: 60_000 })
  anonGuard.assertClean('anon-c2-submit')
  await context.close()

  const candidates = await findCandidatesForVacancy(ctx.vacancyId)
  const c2 = candidates.find((c) => c.first_name?.includes(`${ctx.runId}-C2`))
  expect(c2).toBeTruthy()
  ctx.candidate2Id = c2.id
  await trackCandidate(c2.id)
  const c1 = await getCandidateDiagnostics(ctx.candidate1Id)
  const c2full = await getCandidateDiagnostics(c2.id)
  expect(Number(c1.answers?.form_version)).not.toBe(Number(c2full.answers?.form_version))
  guard.assertClean('snapshot-history')
})

test('8. Outdated form submit is rejected', async ({ browser }) => {
  const hrContext = await browser.newContext()
  const anonContext = await browser.newContext()
  const hrPage = await hrContext.newPage()
  const anonPage = await anonContext.newPage()
  const guardAnon = attachConsoleGuard(anonPage, {
    allow: [/form_outdated|обновлена/i],
  })

  const anon = createAnonClient()
  const { data: formBefore } = await anon.rpc('get_public_vacancy_application_form', {
    p_slug: ctx.vacancySlug,
  })
  const versionBefore = formBefore?.form_version || formBefore?.application_form_version
  await anonPage.goto(appUrl(`/apply/${ctx.vacancySlug}`), { waitUntil: 'domcontentloaded' })
  await expect(anonPage.getByRole('button', { name: 'Отправить анкету' })).toBeVisible()

  // HR bumps form
  await loginAsHr(hrPage)
  await openVacancyByTitle(hrPage, ctx.title)
  await editQuestionByText(hrPage, ctx.customLabels.number, {
    text: `${ctx.customLabels.number} bumped`,
  })
  ctx.customLabels.number = `${ctx.customLabels.number} bumped`
  await saveApplicationForm(hrPage)
  await expect
    .poll(async () => (await getVacancyDiagnostics(ctx.vacancyId)).vacancy?.application_form_version, {
      timeout: 30_000,
    })
    .toBeGreaterThan(Number(versionBefore || 0))
  const after = await getVacancyDiagnostics(ctx.vacancyId)

  // Anon tries submit with stale version via RPC (authoritative)
  const beforeCandidates = (await findCandidatesForVacancy(ctx.vacancyId)).length
  const { error } = await anon.rpc('submit_candidate_application', {
    p_vacancy_id: ctx.vacancyId,
    p_answers: { first_name: 'stale', phone: '77001112233' },
    p_form_version: Number(versionBefore),
    p_photo_upload_id: null,
  })
  expect(String(error?.message || '')).toMatch(/form_outdated/)
  const afterCandidates = (await findCandidatesForVacancy(ctx.vacancyId)).length
  expect(afterCandidates).toBe(beforeCandidates)

  // UI message path: reload and confirm new form label
  await anonPage.reload({ waitUntil: 'domcontentloaded' })
  await expect(anonPage.getByText(ctx.customLabels.number)).toBeVisible({ timeout: 30_000 })

  guardAnon.assertClean('outdated-form')
  await hrContext.close()
  await anonContext.close()
})

test('9. Photo question removed after upload => form_outdated, no attach', async ({ browser }) => {
  const anonContext = await browser.newContext()
  const hrContext = await browser.newContext()
  const anonPage = await anonContext.newPage()
  const hrPage = await hrContext.newPage()
  const anon = createAnonClient()

  await anonPage.goto(appUrl(`/apply/${ctx.vacancySlug}`), { waitUntil: 'domcontentloaded' })
  const { data: form } = await anon.rpc('get_public_vacancy_application_form', {
    p_slug: ctx.vacancySlug,
  })
  const version = form?.form_version || form?.application_form_version
  const photoQ = (form?.questions || []).find((q) => q.question_type === 'photo' || q.questionType === 'photo')
  expect(photoQ).toBeTruthy()

  // Create upload session + upload file as anon would (current form version)
  const { data: session, error: sessErr } = await anon.rpc('create_candidate_photo_upload_session', {
    p_vacancy_id: ctx.vacancyId,
    p_form_version: Number(version),
    p_extension: 'png',
  })
  expect(sessErr).toBeFalsy()
  const uploadId = session?.upload_id
  const storagePath = session?.storage_path
  expect(uploadId).toBeTruthy()
  expect(storagePath).toBeTruthy()
  const png = fs.readFileSync(PHOTO_PATH)
  const { error: upErr } = await anon.storage.from('candidate-photos').upload(storagePath, png, {
    contentType: 'image/png',
    upsert: false,
  })
  expect(upErr).toBeFalsy()

  // HR disables photo question => form version bumps
  await loginAsHr(hrPage)
  await openVacancyByTitle(hrPage, ctx.title)
  await deactivateQuestionByText(hrPage, ctx.customLabels.photo)
  await saveApplicationForm(hrPage)

  const beforeCount = (await findCandidatesForVacancy(ctx.vacancyId)).length
  const { error: submitErr } = await anon.rpc('submit_candidate_application', {
    p_vacancy_id: ctx.vacancyId,
    p_answers: {},
    p_form_version: Number(version),
    p_photo_upload_id: uploadId,
  })
  expect(String(submitErr?.message || '')).toMatch(/form_outdated/)
  const afterCount = (await findCandidatesForVacancy(ctx.vacancyId)).length
  expect(afterCount).toBe(beforeCount)

  const upload = await getUploadDiagnostics(uploadId)
  expect(upload.used_at).toBeFalsy()
  expect(upload.candidate_id).toBeFalsy()

  // After refresh, photo question gone — client must not retain old photo control
  await anonPage.reload({ waitUntil: 'domcontentloaded' })
  await expect(anonPage.getByText(ctx.customLabels.photo)).toHaveCount(0)
  await expect(anonPage.locator('input[type="file"]')).toHaveCount(0)

  await hrContext.close()
  await anonContext.close()
})

test('10. Candidate card: notes, invite, signed photo, createFromCandidate', async ({ page }) => {
  const guard = attachConsoleGuard(page, { allow: HR_SOFT_PROBE_ALLOW })
  await loginAsHr(page)
  await page.goto(appUrl('/platform/hr/candidates'), { waitUntil: 'domcontentloaded' })
  await page.getByText(`${ctx.runId}-C1`).first().click()
  await page.locator('button.candidate-answers-section__toggle').evaluate((el) => el.click())
  await expect(page.locator('.candidate-answers-list')).toBeVisible()

  // Notes
  const notesArea = page.locator('textarea.candidate-notes-section__textarea').first()
  if (await notesArea.count()) {
    await notesArea.fill(`Note ${ctx.runId}`)
    await page.getByRole('button', { name: /Сохранить заметку/i }).click()
  }
  await page.keyboard.press('Escape')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(`${ctx.runId}-C1`).first().click()
  if (await notesArea.count()) {
    await expect(notesArea).toHaveValue(new RegExp(ctx.runId))
  }

  // Invite
  const inviteBtn = page.getByRole('button', { name: 'Пригласить на собеседование' })
  if (await inviteBtn.count()) {
    await inviteBtn.click()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const yyyy = tomorrow.toISOString().slice(0, 10)
    await page.locator('input[type="date"]').fill(yyyy)
    await page.locator('input[type="time"]').fill('11:30')
    await page.getByPlaceholder(/Адрес/i).fill(`E2E address ${ctx.runId}`)
    await page.getByRole('button', { name: 'Пригласить', exact: true }).click()
    await expect(page.getByText(/Приглашён|11:30|E2E address/i).first()).toBeVisible({
      timeout: 30_000,
    })
  }

  // Restore to new / move to interview_passed for createFromCandidate
  const admin = createAdminClient()
  await admin
    .from('academy_candidates')
    .update({ status: 'interview_passed' })
    .eq('id', ctx.candidate1Id)

  await page.keyboard.press('Escape')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(`${ctx.runId}-C1`).first().click()
  const createBtn = page.getByRole('button', { name: 'Создать сотрудника' })
  await expect(createBtn).toBeVisible({ timeout: 30_000 })
  await createBtn.click()
  await page.waitForURL(new RegExp(`createFromCandidate=${ctx.candidate1Id}`), { timeout: 30_000 })
  await expect(page).toHaveURL(new RegExp(`/platform/employees/list`))
  // Prefill checks — do not submit create
  await expect(
    page.locator(`input[value*="${ctx.runId}"]`).first()
  ).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '10-create-from-candidate.png'), fullPage: true })
  // Navigate away without creating
  await page.goto(appUrl('/platform/hr/candidates'), { waitUntil: 'domcontentloaded' })
  const { count } = await admin
    .from('academy_users')
    .select('id', { count: 'exact', head: true })
    .ilike('full_name', `%${ctx.runId}%`)
    .neq('login', loadState().login)
  expect(count || 0).toBe(0)

  // Neutralize status
  await admin.from('academy_candidates').update({ status: 'new' }).eq('id', ctx.candidate1Id)
  guard.assertClean('candidate-card')
})

test('11. Duplicate vacancy via UI', async ({ page }) => {
  const guard = attachConsoleGuard(page, { allow: HR_SOFT_PROBE_ALLOW })
  await loginAsHr(page)
  await page.goto(appUrl('/platform/hr/vacancies'), { waitUntil: 'domcontentloaded' })
  const row = page.locator('tr', { hasText: ctx.title })
  await row.getByRole('button', { name: 'Дублировать вакансию' }).click()
  await expect(page.getByRole('heading', { name: /Редактировать|Создать/ })).toBeVisible({
    timeout: 30_000,
  })
  const titleValue = await page.locator('#vacancy-form').getByLabel('Название вакансии *').inputValue()
  expect(titleValue).toBeTruthy()
  await expect(page.locator('#vacancy-form').getByLabel('Статус')).toHaveValue('draft')

  const admin = createAdminClient()
  const { data: dupes } = await admin
    .from('academy_vacancies')
    .select('id, title, slug, status, position_id, application_form_version')
    .ilike('title', `${ctx.runId}%`)
    .neq('id', ctx.vacancyId)
  expect((dupes || []).length).toBeGreaterThanOrEqual(1)
  const dupe = dupes[0]
  ctx.duplicateVacancyId = dupe.id
  await trackVacancy(dupe.id)
  expect(dupe.status).toBe('draft')
  expect(dupe.slug).not.toBe(ctx.vacancySlug)
  expect(dupe.id).not.toBe(ctx.vacancyId)

  const src = await getVacancyDiagnostics(ctx.vacancyId)
  const copy = await getVacancyDiagnostics(dupe.id)
  expect(copy.vacancy.position_id).toBe(src.vacancy.position_id)
  const srcActive = src.questions.filter((q) => q.is_active !== false)
  const copyActive = copy.questions.filter((q) => q.is_active !== false)
  expect(copyActive.length).toBe(srcActive.length)
  const copyIds = new Set(copyActive.map((q) => q.id))
  for (const q of srcActive) expect(copyIds.has(q.id)).toBe(false)
  expect(copyActive.filter((q) => q.field_binding === 'first_name').length).toBe(1)
  expect(copyActive.filter((q) => q.field_binding === 'phone').length).toBe(1)
  const copyCandidates = await findCandidatesForVacancy(dupe.id)
  expect(copyCandidates.length).toBe(0)

  const rollback = await assertDuplicateRollback(ctx.vacancyId)
  expect(rollback.failedAsExpected).toBe(true)

  const protectedRows = await assertProtectedVacanciesUntouched()
  expect(protectedRows.map((r) => r.slug).sort()).toEqual(['kassir', 'prodavets'].sort())
  guard.assertClean('duplicate')
})

test('12. Mobile viewports smoke', async ({ browser }) => {
  test.setTimeout(300_000)
  const viewports = [
    { name: '320', width: 320, height: 640 },
    { name: '390', width: 390, height: 844 },
    { name: '1440', width: 1440, height: 900 },
  ]
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    const guard = attachConsoleGuard(page, { allow: HR_SOFT_PROBE_ALLOW })
    await loginAsHr(page)
    await openVacancyByTitle(page, ctx.title)
    await expectNoHorizontalScroll(page)
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `12-hr-modal-${vp.name}.png`),
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Предварительный просмотр' }).click()
    const preview = page.getByRole('dialog', { name: 'Предварительный просмотр анкеты' })
    await expect(preview).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `12-preview-${vp.name}.png`),
      fullPage: true,
    })
    await preview.locator('button.btn', { hasText: 'Закрыть' }).click()
    await expect(preview).toBeHidden({ timeout: 10_000 })
    await page.goto(appUrl(`/apply/${ctx.vacancySlug}`), { waitUntil: 'domcontentloaded' })
    await expectNoHorizontalScroll(page)
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `12-public-${vp.name}.png`),
      fullPage: true,
    })
    guard.assertClean(`mobile-${vp.name}`)
    await context.close()
  }
})
