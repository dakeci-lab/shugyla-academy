# План: restyle публичных careers

**Статус:** C1–C4 реализованы (verify — прогнать; коммит/PR — по команде владельца).  
**Дата:** 2026-08-21.  
**Аудит:** `docs/careers/audit-public-careers-restyle.md`  
**Визуал (единственный источник):** `design-reference/shugyla-career-concept.html` (+ mobile-секции).  
**Бренд:** `src/assets/brand/`

Коммит / push / merge — **только по команде владельца**.

---

## Цель

Привести публичные careers (`jobs.shugyla-market.kz` / COMBINED `/apply`, `/vacancies`) к утверждённому дизайну: Bluecurve + Montserrat, логотипы, pattern, секции hub/detail/form/success — **без** изменения контракта list / form / submit / photo / RPC / RLS.

## Non-goals

- Новые Edge Functions, миграции, ослабление RLS/RPC.
- HR internal `/platform/hr/vacancies`.
- Новая UI-библиотека / Tailwind / state-lib.
- Отдельный success route.
- Реальные фото hero/about/gallery в v1 (только плейсхолдеры + pattern).
- Ломка `LangSwitch` API — только CSS «пилюли» как в референсе.
- Corporate surface (`shugyla-market.kz`) и platform chrome.

---

## Токены и ассеты

### CSS variables (scope: `.careers-public-layout` или `careers-tokens.css`)

Из `src/assets/brand/README.txt` + референс:

| Token | Value |
|-------|-------|
| `--brand-green` | `#14A752` |
| `--brand-orange` | `#F09718` |
| `--brand-charcoal` | `#38342F` |
| `--brand-cream` | `#FFF2E9` |
| `--brand-white` | `#FFFFFF` |
| `--font-display` | `'Bluecurve', 'Montserrat', sans-serif` |
| `--font-body` | `'Montserrat', sans-serif` |

Доп. ink/border — копировать из concept (`--ink-soft`, `--border-soft` и т.п.), не изобретать новую палитру.

### Vite-импорты

```text
src/assets/brand/fonts/Bluecurve-Light.ttf
src/assets/brand/fonts/Bluecurve-Regular.ttf
src/assets/brand/fonts/Bluecurve-Bold.ttf
src/assets/brand/logo/logo-primary.png
src/assets/brand/logo/logo-on-green.png
src/assets/brand/logo/logo-white-mono.png
src/assets/brand/logo/icon-sunmark.png
src/assets/brand/pattern/pattern-tile.svg
```

Пример:

```js
import logoPrimary from '../assets/brand/logo/logo-primary.png'
import patternTile from '../assets/brand/pattern/pattern-tile.svg'
```

```css
@font-face {
  font-family: 'Bluecurve';
  src: url('../assets/brand/fonts/Bluecurve-Regular.ttf') format('truetype');
  font-weight: 400;
  font-display: swap;
}
/* Light 300, Bold 700 — аналогично */
```

**Montserrat:** Google Fonts link (wght 400;500;600;700) — только в careers layout (не глобально на platform), либо условный `<link>` / CSS `@import` в careers CSS. Не дублировать base64 из concept HTML.

### Contact (из референса)

Извлечено из `design-reference/shugyla-career-concept.html` (contact-band + footer):

| Поле | Строка в concept |
|------|------------------|
| Заголовок | `Есть вопросы?` |
| Lead | `Мы всегда на связи и готовы ответить на вопросы о работе.` |
| Телефон | `+7 706 840 5000` (канон владельца) |
| Email | `shugyla.market.tur@gmail.com` |
| Адрес (footer) | `Туркестан` |
| CTA | `Написать нам` → mailto |
| Copyright | `© 2026 Shugyla Market. Все права защищены.` |

Контакты подтверждены владельцем; demo из concept не используется.

---

## PR C1 — Foundation + header + footer

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:careers-restyle-c1` (+ `verify:recruitment-public-careers-ui`, `verify:recruitment-apply-hub`).

**Ветка (рекомендация):** `cursor/careers-restyle-c1-foundation`  
**База:** `main` (после merge ассетов/аудита, если ещё не в main — включить `src/assets/brand` + design-reference в этот PR).

### UX

- Подключить токены, Bluecurve `@font-face`, Montserrat (Google).
- `CareersHeader`: PNG `logo-primary` вместо «S»; sticky как в референсе; **LangSwitch** остаётся, CSS = пилюли RU/KZ.
- Опционально: nav «Вакансии» (anchor/scroll к списку на hub или link home) + header CTA «Смотреть вакансии» — только если не ломает COMBINED/CAREERS path helpers.
- `CareersFooter` (новый): `logo-on-green`, phone/email/address из таблицы contact, copyright.
- Layout: cream/white фон по референсу (убрать текущие radial greens, если конфликтуют с brand).

### Файлы (ожидаемые)

| Файл | Что |
|------|-----|
| `src/layouts/CareersPublicLayout.jsx` + `.css` | tokens import, footer slot, font link |
| `src/components/careers/CareersHeader.jsx` + `.css` | logo img, lang pills |
| `src/components/careers/CareersFooter.jsx` + `.css` | новый |
| `src/components/careers/careers-tokens.css` (или аналог) | variables + @font-face |
| `src/components/LangSwitch.css` **или** scoped override в careers header | пилюли без поломки platform LangSwitch — предпочтительно scoped `.careers-header .lang-switch` |
| `scripts/verify-careers-restyle-c1.mjs` (+ `package.json`) | static: Bluecurve paths, logo import, footer, LangSwitch present |
| этот plan-док | статус C1 |

Не трогать: `ApplyHub`/`Apply`/`VacancyDetail` разметку секций (кроме layout wrap). Services — нет.

### Verify + приёмка C1

```bash
npm run verify:careers-restyle-c1   # новый
npm run verify:recruitment-public-careers-ui
npm run verify:recruitment-apply-hub
```

**Ручные:** jobs `/` и COMBINED `/apply` — header с лого, RU/KZ пилюли переключают язык, footer виден, platform `/platform` без Montserrat/Bluecurve утечки (по возможности).

### Риски

- Глобальный Google Fonts на всём приложении → грузить только careers layout.
- Override `LangSwitch` ломает platform → только scoped CSS.
- Большой бинарный concept HTML в git уже лежит — не раздувать PR data-URI шрифтами.

---

## PR C2 — Hub (hero / benefits / cards / about / contact)

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:careers-restyle-c2` (+ `verify:recruitment-apply-hub`, `verify:careers-restyle-c1`).

**Ветка:** `cursor/careers-restyle-c2-hub`  
**Зависит от:** C1 merged (токены/footer).

### Contact (канон владельца)

| Поле | Значение |
|------|----------|
| Телефон | `+7 706 840 5000` |
| Email | `shugyla.market.tur@gmail.com` |
| Адрес | `Туркестан` |
| CTA | mailto на email |

Demo-телефон из concept **не** используется.

### UX

Соответствие экрану «Главная» референса (desktop + mobile):

1. **Hero** — eyebrow, H1, lead, primary/secondary CTA; медиа = pattern/placeholder («Фото фасада»), не ждать реальных файлов.  
2. **Benefits** — 3 карточки (Стабильность / Развитие / …) как в concept.  
3. **Vacancy list** — restyle `apply-hub-card` → card с иконкой / title / meta / chevron; data по-прежнему из `fetchPublishedVacanciesForApply`; city filter сохранить.  
4. **About band** — pattern-edge + placeholder «Фото команды».  
5. **Contact band** — строки из таблицы contact (+ TODO owner).  
6. Footer уже из C1.

i18n: новые строки → `LanguageContext` / careers keys (ru+kz), не хардкодить только RU без kz.

### Файлы (ожидаемые)

| Файл | Что |
|------|-----|
| `src/pages/ApplyHub.jsx` + `ApplyHub.css` | секции hub |
| опционально `src/components/careers/CareersHero.jsx` и т.п. | если разметка раздуется |
| i18n keys | benefits/contact copy |
| `scripts/verify-careers-restyle-c2.mjs` | секции + отсутствие вызова новых service |
| plan status C2 |

Не трогать: services, submit, detail/apply pages (кроме общих CSS vars).

### Verify + приёмка C2

```bash
npm run verify:careers-restyle-c2
npm run verify:recruitment-apply-hub
npm run verify:recruitment-public-careers-ui
npm run verify:recruitment-vacancy-public-fields
```

**Ручные:** список грузится; клик карточки → `/vacancies/:slug`; empty/error/loading states живы; mobile ≈ concept.

### Риски

- Сломать loading/error/empty ветки hub.  
- Contact demo-телефон уйдёт в прод без подтверждения владельца.  
- Слишком много карточных «facts» vs meta референса — упростить отображение, поля RPC не урезать.

---

## PR C3 — Vacancy detail + mobile sticky CTA

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:careers-restyle-c3` (+ `verify:recruitment-public-careers-ui`, c1/c2).

**Ветка:** `cursor/careers-restyle-c3-detail`  
**Зависит от:** C1 (желательно C2 для визуальной связности).

### Маппинг блоков контента (без выдуманного текста)

| Блок UI | Публичное поле |
|---------|----------------|
| Что нужно делать | `description` (абзац или список по `\n`) |
| Что мы ожидаем | `experienceRequirement` (через i18n) |
| Что предлагаем | `salary*` / `schedule` / `employmentType` — только если заданы |
| Pills | city / employment / schedule |
| Side card «О вакансии» | position + facts (store/city/employment/schedule/salary) |

Пустой блок не рендерится. RPC list не менялся.

### UX

- Экран «Вакансия»: title, facts, описание в стиле референса.  
- Desktop CTA «Откликнуться» → `/apply/:slug` (как сейчас).  
- **Mobile sticky CTA** внизу (как `.sticky-cta` в concept) — тот же link; не дублировать submit.  
- Back to vacancies / home path helpers без изменений.

### Файлы

| Файл | Что |
|------|-----|
| `src/pages/VacancyDetailPage.jsx` + `Apply.css` (или `VacancyDetail.css`) | layout + sticky |
| `scripts/verify-careers-restyle-c3.mjs` | sticky class + apply link |
| plan status C3 |

Не трогать: list RPC find-by-slug логику; form page.

### Verify + приёмка C3

```bash
npm run verify:careers-restyle-c3
npm run verify:recruitment-public-careers-ui
```

**Ручные:** desktop + ~390px — sticky виден, ведёт на форму; closed/missing vacancy states.

### Риски

- Sticky перекрывает footer / safe-area — padding-bottom на main.  
- Два CTA (inline + sticky) на mobile — как в референсе, ок.

---

## PR C4 — Form visual + success layout

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:careers-restyle-c4` (+ public-apply / private-photos / flexible-form / form-hardening).

**Ветка:** `cursor/careers-restyle-c4-form-success`  
**Зависит от:** C1; желательно C3.

### UX

- Визуал анкеты: section titles, fields, photo uploader, consent, primary submit — как экран «Анкета».  
- Mobile sticky «Отправить анкету» может вызывать тот же submit handler (не второй form post).  
- **Success:** ветка `if (submitted)` в `Apply.jsx` — layout «Спасибо» + `icon-sunmark` + **gallery placeholders** (pattern / ph), без нового route.  
- Photo upload session / validate / cancel — без изменений API.

### Файлы

| Файл | Что |
|------|-----|
| `src/pages/Apply.jsx` + `Apply.css` | form chrome + success markup |
| возможно `DynamicApplicationForm` CSS only | если классы общие |
| `scripts/verify-careers-restyle-c4.mjs` | `submitted` state + gallery/placeholder; **нет** нового route success; services untouched |
| plan status C4 |

### Verify + приёмка C4

```bash
npm run verify:careers-restyle-c4
npm run verify:recruitment-public-apply
npm run verify:recruitment-private-photos
npm run verify:recruitment-flexible-form
npm run verify:recruitment-form-hardening
```

**Ручные:** заполнить форму + фото → success UI; refresh не создаёт фейковый success URL; ошибка upload по-прежнему блокирует submit.

### Риски

- Sticky submit + нативный submit button = double-submit → disable оба при `submitting`.  
- Импорт admin-shared.css в Apply — не разъехать platform admin.  
- Success gallery не должна грузить тяжёлые base64 из concept.

---

## Порядок выкладки

```text
C1 foundation+header+footer
  → C2 hub sections
    → C3 vacancy detail + sticky
      → C4 form + success (submitted state)
```

- Один PR = один этап; не смешивать C2+C4.  
- После каждого: verify зелёные → ревью → merge по команде.  
- Ориентир сообщений:

```text
feat(careers): C1 tokens, header logo, footer shell
feat(careers): C2 hub hero benefits cards about contact
feat(careers): C3 vacancy detail sticky CTA
feat(careers): C4 apply form visual and success layout
```

---

## Закрытые решения

1. Success = `submitted` state в `Apply.jsx`, **без** отдельного route.  
2. `LangSwitch` остаётся; CSS пилюли RU/KZ как в референсе.  
3. Hero / about / success gallery в v1 — плейсхолдеры + pattern; реальные фото позже.  
4. Серия PR: **C1 → C2 → C3 → C4**.  
5. Montserrat = Google Fonts; Bluecurve = `@font-face` из `src/assets/brand/fonts`.  
6. List / submit / photo / RPC / RLS не менять; обычный CSS; без UI-lib.  
7. Contact-строки из concept; телефон — demo → **TODO владельцу подтвердить канон**.  
8. Единственный визуальный источник — `design-reference/shugyla-career-concept.html`.

---

## Preflight исполнителя (каждый PR)

1. Прочитать этот план + соответствующий экран(ы) в concept (desktop **и** mobile).  
2. Дифф только по файлам этапа.  
3. Прогнать verify этапа + указанные recruitment regress.  
4. Не коммитить, пока владелец не попросит.
