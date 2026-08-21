# Аудит: restyle публичных careers (jobs.shugyla-market.kz)

**Дата:** 2026-08-21.  
**Этап:** 0 (ассеты разложены) + 1 (этот аудит). JSX страниц / логика / RLS — **не менялись**.  
**Референс:** `design-reference/shugyla-career-concept.html` (4 экрана × desktop/mobile).  
**Бренд:** `src/assets/brand/` (Bluecurve, logo PNG, pattern-tile, README).

---

## 1. Карта роутов

Источник: `src/App.jsx` + `src/router/hostSurface.js` (`HOST_SURFACE.CAREERS` = `jobs.shugyla-market.kz`).

| Путь | Surface / условие | Компонент | Оболочка |
|------|-------------------|-----------|----------|
| `/` | CAREERS | `ApplyHubPage` | `CareersPublicLayout` (children) |
| `/` | CORPORATE | `CorporateHome` | — |
| `/` | иначе | redirect → login | — |
| `/vacancies` | careersEnabled | `VacanciesPage` → `CareersHomeRedirect` (алиас списка) | `CareersPublicLayout` (Outlet) |
| `/vacancies/:slug` | careersEnabled | `VacancyDetailPage` | то же |
| `/apply` | COMBINED | `ApplyHubPage` (локальный список) | то же |
| `/apply` | CAREERS | `CareersHomeRedirect` → `/` | то же |
| `/apply/:slug` | careersEnabled | `ApplyPage` | то же |

Публичные маршруты **без** `PlatformData` / `Permission` / `NotificationInbox` (комментарий в `App.jsx`).

`CareersPublicLayout`: sticky `CareersHeader` + `children \|\| <Outlet />`, document title из `t.careersDocumentTitle`.

`careersEnabled` = CAREERS или COMBINED; иначе `CareersExternalRedirect` на jobs-origin.

---

## 2. Данные: list / form / submit / photo

| Шаг | Модуль | Механизм |
|-----|--------|----------|
| Список вакансий | `publicApplyVacanciesService.fetchPublishedVacanciesForApply` | Cloud: RPC `list_published_vacancies_for_apply`. Local: `getPublishedVacanciesSync` + фильтр published. |
| Деталь `/vacancies/:slug` | тот же list RPC | Клиентский `.find(slug)` — отдельного get-by-slug RPC нет. |
| Анкета `/apply/:slug` | `publicApplyFormService.fetchPublicVacancyApplicationForm` | Cloud: RPC формы (+ formVersion / questions). Local: recruitment sync helpers. |
| Submit | `publicApplySubmitService.submitPublicCandidateApplication` | Photo prep → `recruitmentSupabaseAdapter` / local adapter. Без PlatformData refresh. |
| Фото | `candidatePhotoService` | `create_candidate_photo_upload_session` → storage upload → `photoUploadId` в submit; cancel session при сбросе. |

**Не ослаблять:** SECURITY DEFINER RPC, upload session, RLS storage, formVersion / submissionKey. Restyle = CSS + разметка презентации, не контракт.

---

## 3. Текущие CSS / UI-скелет

| Файл | Роль | Объём |
|------|------|-------|
| `layouts/CareersPublicLayout.css` | фон layout (зелёные radial gradients + `#f4f7f5`) | ~8 строк |
| `components/careers/CareersHeader.css` | sticky header, «S» mark, имя бренда, LangSwitch | ~57 |
| `pages/ApplyHub.css` | hub hero + карточки списка + filter/skeleton | ~218 |
| `pages/Apply.css` | detail card, форма, consent, success | ~253 |
| `pages/Vacancies.css` | **orphan** — нигде не импортируется | ~130 |

Компоненты:

- **Header:** буква «S» + текст, `LangSwitch` уже есть. Нет PNG лого, nav «Вакансии», CTA в header.
- **Hub:** текстовый hero (brand / title / lead / note) → секция открытых вакансий → карточки (`apply-hub-card`) → ссылка на `/vacancies/:slug`. Нет benefits / about / contact / footer по референсу.
- **Detail:** `apply-page__card`, факты `dl`, CTA «Откликнуться» → `/apply/:slug`. Нет sticky mobile CTA.
- **Apply:** `DynamicApplicationForm` + photo uploader + consent; success = `submitted` state в том же `Apply.jsx` (карточка + ссылка на hub). Нет gallery / отдельного route.
- **Шрифты/паттерн:** Bluecurve и `pattern-tile` в продукт ещё не подключены; референс тянет Montserrat с Google Fonts + локальные `@font-face` Bluecurve (пути в HTML нужно будет поправить на `src/assets/brand` при restyle).

---

## 4. Сопоставление с референсом

Референс-экраны: **Главная / Вакансия / Анкета / Спасибо** × Desktop 1440 / Mobile 390.

| Секция референса | В продукте сейчас | Gap |
|------------------|-------------------|-----|
| **Header** (logo PNG, nav, lang RU/KZ, CTA) | `CareersHeader`: text mark + **LangSwitch есть** | Визуал лого/nav/CTA; lang UX уже частично закрыт |
| **Hero** (eyebrow, H1, 2 CTA, фото фасада) | Текст hero без медиа / secondary CTA | Нет image plane, вторичной кнопки |
| **Benefits** (сетка карточек) | Нет | Новый блок (контент статичный) |
| **VacancyCard** (иконка, title, meta, chevron) | `apply-hub-card` (title/position/desc/facts/CTA) | Другая иерархия; restyle + возможно упростить meta |
| **About band** + pattern | Нет | Новый блок + `pattern-tile.svg` |
| **Contact band** | Нет | Новый блок (контакты — уточнить у владельца при реализации) |
| **Footer** (logo-on-green) | Нет | Новый |
| **Vacancy detail** | Есть факты + apply CTA | Visual parity; mobile **sticky CTA** отсутствует |
| **Form + uploader** | Полный функционал | Только визуал / секции формы |
| **Success** | State в `Apply.jsx` | Нет gallery 2×2/4; нет sunmark success icon |
| **Mobile sticky CTA** | Нет | Detail + Form |

---

## 5. Gaps (продукт vs референс)

1. Маркетинговые блоки hub: benefits, about, contact, footer.  
2. Реальные фото (hero / about / success gallery) — в референсе placeholders.  
3. Brand assets в runtime: `@font-face` Bluecurve, PNG logos, pattern.  
4. Montserrat: в README — Google Fonts; в продукте сейчас системный/общий стек платформы.  
5. Sticky CTA на mobile (detail + form).  
6. Success gallery + richer thank-you layout.  
7. Header CTA «Смотреть вакансии» / active nav — в продукте список и так главная на CAREERS.  
8. `Vacancies.css` мёртвый файл — кандидат на удаление в restyle-PR (не обязательно этап 0).

**Уже есть и не «gap»:** LangSwitch в header; city filter при >1 городе; photo upload pipeline; i18n ключи careers_*.

---

## 6. Рекомендация: Success

**Оставить success как `submitted` state в `Apply.jsx` (без отдельного route).**

Почему:

- Нет shareable URL «спасибо» в текущем флоу; submit idempotency завязан на страницу формы.  
- Отдельный `/apply/:slug/success` потребует защиты от прямого захода без submit и усложнит deep-link.  
- Референс — презентационный экран; визуально можно заменить ветку `if (submitted)` тем же layout (hero copy + gallery), не меняя роутинг.

Отдельный route — только если позже понадобится analytics landing или email-deep-link.

---

## 7. Non-goals (следующие этапы restyle)

- Изменения `supabase/migrations`, RLS, RPC, Edge.  
- HR internal `/platform/hr/vacancies` UI.  
- Новая UI-библиотека / Tailwind.  
- Ломка submit / photo session / formVersion.  
- В этом шаге (этап 0–1): **не** переодевать JSX карьерных страниц.

---

## 8. Раскладка ассетов (этап 0 — сделано)

```text
design-reference/shugyla-career-concept.html   ← бывший корневой concept
src/assets/brand/
  fonts/   Bluecurve-Light|Regular|Bold.ttf + COPYRIGHT.txt
  logo/    logo-primary|on-green|white-mono.png, icon-sunmark.png
  pattern/ pattern-tile.svg
  README.txt
```

Корневые `shugyla-career-design-concept.html` и `shugyla-brand-assets/` удалены после переноса. `.DS_Store` не копировался.

---

## 9. Вопросы владельцу (макс. 5)

1. **Lang switch в header** — оставить как сейчас (`LangSwitch`), или визуально как пилюли RU/KZ из референса (логика та же)?  
2. **Success gallery / hero / about photos** — будут реальные файлы в `src/assets/brand` (или `public/`), или на первом PR плейсхолдеры/pattern?  
3. **Поставка restyle** — один широкий PR или серия (tokens+header → hub → detail/form/success)?  
4. **Montserrat** — Google Fonts (как в concept/README) или скачать локально рядом с Bluecurve?  
5. **Contact band** — какие телефон / email / адрес / CTA «Написать нам» считать каноном для jobs?

---

## 10. Черновик следующих PR (не делать сейчас)

| PR | Фокус |
|----|--------|
| C1 | CSS variables + `@font-face` + logo в `CareersHeader` + layout/footer shell |
| C2 | Hub: hero / benefits / cards / about / contact |
| C3 | Vacancy detail + mobile sticky CTA |
| C4 | Apply form visual + success layout (state) |

Verify ориентиры: существующие recruitment/careers static verifies + ручной проход list → detail → apply → photo → success на jobs/local COMBINED.
