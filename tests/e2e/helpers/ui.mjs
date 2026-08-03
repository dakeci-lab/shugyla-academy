import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import { getBaseUrl } from './env.mjs'
import { loadState } from './fixture.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const PHOTO_PATH = path.resolve(__dirname, '../assets/candidate-photo.png')

export function appUrl(pathname = '/') {
  const base = getBaseUrl()
  const clean = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${base}${clean}`
}

export async function loginAsHr(page, credentials = {}) {
  const state = loadState()
  const login = credentials.login || process.env.E2E_HR_LOGIN || state?.login
  const password = credentials.password || process.env.E2E_HR_PASSWORD || state?.password
  if (!login || !password) throw new Error('Missing E2E HR credentials')

  await page.goto(appUrl('/login'), { waitUntil: 'domcontentloaded' })
  await page.locator('input[autocomplete="username"]').fill(login)
  await page.locator('input[autocomplete="current-password"]').fill(password)
  await page.locator('button.login-page__submit').click()

  await page.waitForURL(/\/platform(\/|$)/, { timeout: 60_000 })
  // Wait for session/RBAC readiness — vacancies page should not infinite-spin.
  await page.goto(appUrl('/platform/hr/vacancies'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '+ Создать вакансию' })).toBeVisible({
    timeout: 60_000,
  })
}

export async function openCreateVacancyModal(page) {
  await page.getByRole('button', { name: '+ Создать вакансию' }).click()
  await expect(page.getByRole('heading', { name: 'Создать вакансию' })).toBeVisible()
}

export async function createDraftVacancy(page, { title, positionName }) {
  await openCreateVacancyModal(page)
  const select = page.locator('#vacancy-position-select')
  await expect(select).toBeEnabled({ timeout: 30_000 })
  // Prefer matching by visible position name; fallback to first non-empty option.
  const options = select.locator('option')
  const count = await options.count()
  let value = ''
  for (let i = 0; i < count; i += 1) {
    const text = ((await options.nth(i).textContent()) || '').trim()
    const val = await options.nth(i).getAttribute('value')
    if (!val) continue
    if (positionName && text.includes(positionName)) {
      value = val
      break
    }
    if (!value) value = val
  }
  if (!value) throw new Error('No active position option in vacancy form')
  await select.selectOption(value)

  const titleInput = page.locator('#vacancy-form').getByLabel('Название вакансии *')
  // Autofill from position may fill title — overwrite with unique E2E title.
  await titleInput.fill(title)
  await page.locator('#vacancy-form').getByLabel('Статус').selectOption('draft')
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Анкета кандидата')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Редактировать вакансию' })).toBeVisible()
}

export async function saveVacancyForm(page) {
  await page.locator('button.btn.btn--primary[form="vacancy-form"]').click()
  await page.waitForTimeout(800)
  const err = page.locator('#vacancy-form .admin-form__error, .admin-form__error').first()
  if (await err.isVisible().catch(() => false)) {
    const text = ((await err.textContent()) || '').trim()
    if (text) throw new Error(`Vacancy save error: ${text}`)
  }
}

export async function publishVacancyInModal(page) {
  const positionSelect = page.locator('#vacancy-position-select')
  await expect(positionSelect).toBeEnabled({ timeout: 30_000 })
  await expect
    .poll(async () => positionSelect.inputValue(), { timeout: 30_000 })
    .not.toEqual('')
  await page.locator('#vacancy-form select.admin-form__select').last().selectOption('published')
  await saveVacancyForm(page)
  await expect(page.getByText(/Вакансия сохранена|сохранена/i).first()).toBeVisible({
    timeout: 15_000,
  }).catch(() => {})
  await expect(page.locator('#vacancy-form select.admin-form__select').last()).toHaveValue(
    'published'
  )
}

export async function openVacancyByTitle(page, title) {
  await page.goto(appUrl('/platform/hr/vacancies'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '+ Создать вакансию' })).toBeVisible({
    timeout: 60_000,
  })
  await page.getByRole('button', { name: title, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Редактировать вакансию' })).toBeVisible()
  await expect(page.locator('#vacancy-position-select')).toBeEnabled({ timeout: 30_000 })
  await expect
    .poll(async () => page.locator('#vacancy-position-select').inputValue(), { timeout: 30_000 })
    .not.toEqual('')
}

export async function addQuestion(page, question) {
  await page.getByRole('button', { name: 'Добавить вопрос' }).click()
  const modal = page.locator('#question-edit-form')
  await expect(modal).toBeVisible()
  await modal.getByLabel('Текст вопроса *').fill(question.text)
  await modal.getByLabel('Тип ответа').selectOption(question.type)
  if (question.required === false) {
    const checkbox = modal.getByLabel('Обязательный вопрос')
    if (await checkbox.isChecked()) await checkbox.uncheck()
  } else if (question.required === true) {
    const checkbox = modal.getByLabel('Обязательный вопрос')
    if (!(await checkbox.isChecked())) await checkbox.check()
  }
  if (question.placeholder) {
    await modal.getByLabel('Placeholder').fill(question.placeholder)
  }
  if (question.helpText) {
    await modal.getByLabel('Пояснение').fill(question.helpText)
  }
  if (question.options?.length) {
    const rows = modal.locator('.vacancy-application-editor__option-row input')
    // Ensure enough option rows
    while ((await rows.count()) < question.options.length) {
      await modal.getByRole('button', { name: 'Добавить вариант' }).click()
    }
    for (let i = 0; i < question.options.length; i += 1) {
      await rows.nth(i).fill(question.options[i])
    }
  }
  await page.locator('button.btn.btn--primary[form="question-edit-form"]').click()
  await expect(modal).toBeHidden({ timeout: 10_000 })
  await expect(
    page.locator('.vacancy-application-editor__item', { hasText: question.text }).first()
  ).toBeVisible({ timeout: 10_000 })
}

export async function editQuestionByText(page, currentText, updates) {
  const item = page.locator('.vacancy-application-editor__item', {
    hasText: currentText,
  }).first()
  await expect(item).toBeVisible({ timeout: 15_000 })
  await item.scrollIntoViewIfNeeded()
  await item.getByRole('button', { name: 'Изменить' }).click()
  const modal = page.locator('#question-edit-form')
  await expect(modal).toBeVisible()
  if (updates.text != null) await modal.getByLabel('Текст вопроса *').fill(updates.text)
  if (updates.placeholder != null) await modal.getByLabel('Placeholder').fill(updates.placeholder)
  if (updates.helpText != null) await modal.getByLabel('Пояснение').fill(updates.helpText)
  if (updates.options?.length) {
    const rows = modal.locator('.vacancy-application-editor__option-row input')
    while ((await rows.count()) < updates.options.length) {
      await modal.getByRole('button', { name: 'Добавить вариант' }).click()
    }
    for (let i = 0; i < updates.options.length; i += 1) {
      await rows.nth(i).fill(updates.options[i])
    }
  }
  if (updates.required === false) {
    const checkbox = modal.getByLabel('Обязательный вопрос')
    if (await checkbox.isChecked()) await checkbox.uncheck()
  } else if (updates.required === true) {
    const checkbox = modal.getByLabel('Обязательный вопрос')
    if (!(await checkbox.isChecked())) await checkbox.check()
  }
  await page.locator('button.btn.btn--primary[form="question-edit-form"]').click()
  await expect(modal).toBeHidden({ timeout: 10_000 })
}

export async function deactivateQuestionByText(page, text) {
  page.once('dialog', (d) => d.accept())
  const item = page.locator('.vacancy-application-editor__item', { hasText: text }).first()
  await item.getByRole('button', { name: 'Отключить' }).click()
}

export async function saveApplicationForm(page) {
  const btn = page.getByRole('button', { name: 'Сохранить анкету' })
  await expect(btn).toBeEnabled()
  await btn.click()
  // Saving disables the button; wait until it finishes and re-enables.
  await expect(btn).toBeDisabled({ timeout: 30_000 })
  await expect(btn).toBeEnabled({ timeout: 60_000 })
}

export async function openPreview(page) {
  await page.getByRole('button', { name: 'Предварительный просмотр' }).click()
  await expect(page.getByRole('heading', { name: 'Предварительный просмотр анкеты' })).toBeVisible()
}

export async function closeModalByText(page, heading) {
  const dialog = page.locator('.admin-modal, [role="dialog"]').filter({ hasText: heading }).first()
  if (await dialog.count()) {
    await dialog.getByRole('button', { name: /Закрыть|Отмена/ }).first().click()
  }
}

/** Footer "Закрыть" (not the × aria-label close). */
export async function closeVacancyModal(page) {
  const footerClose = page.locator('.admin-modal__footer button.btn', { hasText: 'Закрыть' }).last()
  if (await footerClose.count()) {
    await footerClose.click()
    return
  }
  await page.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
}

function questionLabel(q) {
  return q.label || q.question_text || q.questionText || ''
}

function questionType(q) {
  return q.question_type || q.questionType || ''
}

export async function fillPublicApplication(page, {
  questions,
  firstName,
  phone,
  photoPath = PHOTO_PATH,
}) {
  const list = (questions || []).slice().sort(
    (a, b) => (a.sort_order ?? a.sortOrder ?? 0) - (b.sort_order ?? b.sortOrder ?? 0)
  )

  for (const q of list) {
    if (q.is_active === false || q.isActive === false) continue
    const text = questionLabel(q)
    const type = questionType(q)
    if (!text) continue
    const field = page.locator('.apply-form__field', { hasText: text }).first()
    await expect(field).toBeVisible({ timeout: 15_000 })

    if (type === 'phone' || /телефон/i.test(text)) {
      const input = field.locator('input').first()
      await input.fill(phone)
      continue
    }
    if (/^имя\b/i.test(text) || /имя\s*\*?$/i.test(text) || /first/i.test(text)) {
      // Prefer first_name-like short text among system fields
      if (type === 'short_text' || !type) {
        await field.locator('input').first().fill(firstName)
        continue
      }
    }

    if (type === 'long_text') {
      await field.locator('textarea').fill(`Long answer for ${text}`)
    } else if (type === 'number') {
      await field.locator('input').fill('27')
    } else if (type === 'date') {
      await field.locator('input').fill('2026-08-15')
    } else if (type === 'short_text' || type === '') {
      // Heuristic: first name-like labels already handled; others get generic text
      if (/имя/i.test(text) && !/фамил/i.test(text)) {
        await field.locator('input').first().fill(firstName)
      } else {
        await field.locator('input, textarea').first().fill(`Short ${String(Date.now()).slice(-5)}`)
      }
    } else if (type === 'yes_no') {
      await field.getByText('Да', { exact: true }).click()
    } else if (type === 'single_choice') {
      await field.locator('input[type="radio"]').first().check()
    } else if (type === 'multi_choice') {
      const boxes = field.locator('input[type="checkbox"]')
      const n = Math.min(2, await boxes.count())
      for (let i = 0; i < n; i += 1) await boxes.nth(i).check()
    } else if (type === 'photo') {
      await field.locator('input[type="file"]').setInputFiles(photoPath)
      await expect(page.getByRole('button', { name: 'Отправить анкету' })).toBeEnabled({
        timeout: 90_000,
      })
      await expect(page.getByText('Загрузка фото…')).toHaveCount(0, { timeout: 90_000 })
      await expect(page.locator('.apply-photo-preview img')).toBeVisible({ timeout: 30_000 })
    }
  }
}

function escapeReg(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function submitPublicApplication(page) {
  await page.getByRole('button', { name: 'Отправить анкету' }).click()
}

export async function expectNoHorizontalScroll(page) {
  const hasScroll = await page.evaluate(() => {
    const doc = document.documentElement
    return doc.scrollWidth > doc.clientWidth + 1
  })
  expect(hasScroll).toBe(false)
}
