# План: rollout sunmark (знак-иконка)

**Статус:** S1–S3 реализованы (серия complete; коммит/PR — по команде владельца).  
**Дата:** 2026-08-21.  
**Аудит:** `docs/brand/audit-sunmark-icon-rollout.md`  
**Канон UI/PWA на белом:** `src/assets/brand/logo/icon-sunmark-on-white.png` (512×512)  
**Исходник:** `src/assets/brand/logo/icon-sunmark-source.png` (сохранить)  
**Legacy:** `icon-sunmark.png` — не обязан удалять.

Коммит / push / merge — **только по команде владельца**.

### Deploy checklist (после merge S1–S3)

1. `node scripts/generate-pwa-icons.mjs` (если icons не в артефакте) → `public/icons/*` on-white.  
2. `npm run build` → в `dist/pwa-icons/` есть `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (vite копирует `icons` → `pwa-icons`).  
3. Smoke: corporate mark, platform logo, login, offline, install banner, apply success — sunmark на белом, не «S».  
4. Careers header/footer wordmark без регрессий.

---

## Цель

Заменить букву «S» и устаревшие PWA-иконки фирменным sunmark на **белом фоне** везде: platform, corporate, login/offline/install banner, favicon/PWA/splash/push — без ломки careers wordmark (`logo-primary` / `logo-on-green`).

## Non-goals

- `favicon.ico` (достаточно PNG 192 в `index.html`).  
- Новые UI-библиотеки / постоянная зависимость `sharp` в `package.json` (как сейчас: install on demand в генераторе).  
- Перерисовка careers header/footer wordmark.  
- Смешивать S1+S2+S3 в одном PR.  
- Менять контракт Web Push / SW кроме путей к тем же `pwa-icons/*` именам файлов.

---

## Инструмент генерации (уже в проекте)

| Что | Деталь |
|-----|--------|
| Скрипт | `scripts/generate-pwa-icons.mjs` |
| Движок | **sharp** — динамический `npm install --no-save sharp@…` внутри скрипта (не в dependencies) |
| Сейчас | читает `public/icons/icon-master.png`, кладёт знак на **зелёный градиент**, maskable scale `0.82` (~9% inset) |
| S1 меняет | master/source → `icon-sunmark-on-white.png`; фон **белый**; maskable inset **~20–25%** (content scale ≈ **0.50–0.60**); размеры как ниже |

Альтернативы не нужны: `sips` недостаточен для maskable composite; PIL не в CI. Остаёмся на sharp-скрипте.

Размеры выхода в `public/icons/` (имена сохранить — `index.html` / manifest / `sw.js` не ломать пути):

| Файл | Size | Режим |
|------|------|--------|
| `icon-48.png` | 48 | any — resize on-white |
| `icon-64.png` | 64 | any |
| `icon-128.png` | 128 | any |
| `icon-192.png` | 192 | any (+ favicon / splash / push) |
| `icon-512.png` | 512 | any |
| `apple-touch-icon.png` | 180 | any |
| `icon-maskable-192.png` | 192 | maskable: белый canvas, знак по центру, **20–25%** safe-zone |
| `icon-maskable-512.png` | 512 | maskable то же |
| `icon-master.png` | 1024 (рекомендация) | копия/апскейл on-white для будущих регенов |

Build по-прежнему: `vite.config.js` копирует `dist/icons` → `dist/pwa-icons`.

---

## PR S1 — Public icons

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `node scripts/generate-pwa-icons.mjs`, `npm run verify:sunmark-icons-s1`, `npm run verify:domain-deployment`.

**Ветка (рекомендация):** `cursor/sunmark-s1-pwa-icons`  
**База:** `main` (ассеты `icon-sunmark-on-white` / source уже в дереве или включить в этот PR).

### UX / артефакты

- Переписать `generate-pwa-icons.mjs`: источник = brand on-white; убрать зелёный градиент; maskable padding 20–25%.  
- Прогнать скрипт → обновить все файлы в `public/icons/`.  
- `index.html` / `manifest.webmanifest` / `sw.js` — **пути не менять** (только содержимое PNG).  
- README brand: одна строка «PWA icons генерируются из on-white».

### Файлы (ожидаемые)

| Файл | Что |
|------|-----|
| `scripts/generate-pwa-icons.mjs` | новый пайплайн |
| `public/icons/*` | regenerated PNG |
| `src/assets/brand/README.txt` | при необходимости |
| `scripts/verify-sunmark-icons-s1.mjs` (+ `package.json`) | размеры файлов существуют; master/on-white newer-or-present; нет требования favicon.ico; static assert maskable scale comment/constant |
| этот plan-док | статус S1 |

### Verify + приёмка S1

```bash
node scripts/generate-pwa-icons.mjs
npm run verify:sunmark-icons-s1   # новый
npm run verify:domain-deployment  # pwa-icons paths
# ручной: открыть public/icons/icon-192 и maskable-512 — белый фон, лучи не обрезаны
```

**Риски:** слишком агрессивный palette/quantize в sharp съест оранжевый — отключить/ослабить `palette: true` если артефакты; проверить `verify-loading-system` (исторически мог искать `icons/` vs `pwa-icons/` — не ломать).

---

## PR S2 — Platform UI («S» → img)

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:sunmark-icons-s2`, `npm run verify:domain-deployment`.

**Ветка:** `cursor/sunmark-s2-platform-ui`  
**Зависит от:** S1 (чтобы splash/auth icon уже новый; можно параллельно с UI-only import Vite из brand).

### UX

Заменить литерал `S` на `<img src={sunmark} alt="" />` (или `aria-hidden` + родительский `aria-label`):

| Место | Файл |
|-------|------|
| Desktop logo | `PlatformDesktopNav.jsx` → `PlatformDesktopLogo` |
| Mobile sidebar | `PlatformSidebar.jsx` |
| Login | `Login.jsx` |
| Forgot / Reset | `ForgotPassword.jsx`, `ResetPassword.jsx` |
| Legacy Sidebar / Header | `Sidebar.jsx`, `Header.jsx` — если ещё в роутинге |
| Offline | `public/offline.html` — относительный/BASE путь к иконке (например `pwa-icons/icon-192.png` или встроенный copy) |

CSS: display **28–32px**, убрать зелёный «плашечный» фон под буквой где он имитировал tile — белый/прозрачный вокруг PNG on-white. Hit-area ≥44px сохранить на link.

Источник img предпочтительно: Vite-import `icon-sunmark-on-white.png` (platform) / для offline — URL из `pwa-icons` после S1.

### Файлы

| Файл | Что |
|------|-----|
| перечисленные JSX + CSS | mark → img |
| `public/offline.html` | без «S» |
| `scripts/verify-sunmark-icons-s2.mjs` | нет литерала `S` в logo-mark классах platform/login; import on-white или pwa icon |
| plan status S2 |

Не трогать: Corporate, Apply success, AppInstallBanner (S3). Careers header wordmark.

### Verify + приёмка S2

```bash
npm run verify:sunmark-icons-s2
npm run verify:domain-deployment
# ручной: /platform desktop+mobile, /login — sunmark, не «S»
```

**Риски:** сломать `aria-label` / layout ширины sidebar; offline BASE_PATH на PS.kz.

---

## PR S3 — Corporate + success + install banner + verify prep

**Статус этапа:** реализация сделана, серия S1–S3 complete (готово к ревью).  
**Verify:** `npm run verify:sunmark-icons-s3`, `npm run verify:careers-restyle-c4`, `npm run verify:recruitment-public-careers-ui`, `npm run build` (dist/pwa-icons).

**Ветка:** `cursor/sunmark-s3-surfaces`  
**Зависит от:** S1 (и желательно S2).

### UX

| Место | Действие |
|-------|----------|
| `CorporateHome.jsx` | «S» → sunmark; убрать/заменить зелёный квадрат-фон mark |
| `AppInstallBanner.jsx` | «S» → sunmark |
| `Apply.jsx` success | `icon-sunmark.png` → `icon-sunmark-on-white.png` |
| `verify-careers-restyle-c4.mjs` | assert на on-white (не legacy-only) |
| Deploy prep | убедиться что `npm run build` копирует icons→pwa-icons; короткий чеклист в plan/status |

Legacy `icon-sunmark.png` можно оставить в brand (не удалять обязательно).

### Файлы

| Файл | Что |
|------|-----|
| Corporate + CSS | |
| AppInstallBanner + CSS | |
| Apply.jsx (+ CSS если нужно) | |
| verify c4 + `verify-sunmark-icons-s3.mjs` | |
| plan status S3 complete | |

### Verify + приёмка S3

```bash
npm run verify:sunmark-icons-s3
npm run verify:careers-restyle-c4
npm run verify:recruitment-public-careers-ui
npm run build   # pwa-icons в dist
# ручной: corporate, install banner, apply success gallery icon
```

**Риски:** c4 verify красный пока не обновлён; corporate visual regression.

---

## Порядок выкладки

```text
S1 public/icons regenerate (sharp script)
  → S2 platform + login + offline («S»→img)
    → S3 corporate + success + install banner + verify/build check
```

Ориентир сообщений:

```text
feat(brand): S1 regenerate PWA icons from sunmark-on-white
feat(brand): S2 replace platform S mark with sunmark
feat(brand): S3 corporate success install banner sunmark
```

---

## Закрытые решения

1. Maskable: **~20–25%** белый safe-zone (content scale ≈ 0.50–0.60).  
2. Careers success / UI mark → **`icon-sunmark-on-white.png`**; source сохранить; legacy `icon-sunmark.png` удалять не обязательно.  
3. Corporate + platform + PWA + login/offline/install banner — **везде sunmark**, не «S».  
4. **`favicon.ico` не делать** — PNG 192 достаточно.  
5. Серия PR: **S1 → S2 → S3**.  
6. Размеры из on-white: **48, 64, 128, 192, 512** + **apple-touch (180)** + **maskable 192/512**.  
7. Генерация через существующий **`scripts/generate-pwa-icons.mjs` + sharp** (адаптировать под on-white / белый фон).

---

## Preflight исполнителя (каждый PR)

1. Прочитать этот план + аудит.  
2. Дифф только по файлам этапа.  
3. Прогнать verify этапа.  
4. Не коммитить, пока владелец не попросит.
