# Аудит: rollout фирменного sunmark (знак-иконка)

**Дата:** 2026-08-21.  
**Этап:** 0 (ингест ассетов) + 1 (этот аудит). JSX / `public/icons` / PWA — **не менялись**.  
**Цель знака:** platform «S», favicon, PWA, splash — почти везде на **белом фоне**.  
**Wordmark careers** (`logo-primary` / `logo-on-green`) уже в проде restyle — вне scope замены «S».

## Ассеты (этап 0)

| Файл | Назначение |
|------|------------|
| `src/assets/brand/logo/icon-sunmark-source.png` | исходник владельца (323×319, RGBA; превью на чёрном) |
| `src/assets/brand/logo/icon-sunmark-on-white.png` | **канон для светлого UI**: 512×512 RGB, знак по центру, белый квадрат, ~14% padding |
| `src/assets/brand/logo/icon-sunmark.png` | legacy (careers success сейчас); не удалять до PR замены |
| `src/assets/brand/README.txt` | обновлён |

Генерация on-white: чёрный фон превью убран; зелёное ядро + оранжевые лучи сохранены; без data-URI / без правок JSX.

---

## Карта call site’ов

### A. Буква «S» / текстовый mark (кандидат на sunmark-on-white)

| Место | Файл | Сейчас | Примечание |
|-------|------|--------|------------|
| Platform desktop logo | `PlatformDesktopNav.jsx` → `PlatformDesktopLogo` + `.platform-layout__logo-mark` | литерал `S` | Цель владельца |
| Platform mobile sidebar | `PlatformSidebar.jsx` → `.platform-sidebar__logo-icon` | `S` | Цель владельца |
| Legacy Sidebar | `Sidebar.jsx` → `.sidebar__logo-icon` | `S` | если ещё монтируется |
| Legacy Header | `Header.jsx` → `.header__logo-icon` | `S` | не careers |
| Login | `Login.jsx` → `.login-page__brand-logo` | `S` | splash-adjacent |
| Forgot / Reset password | `ForgotPassword.jsx`, `ResetPassword.jsx` → `.login-page__logo-icon` | `S` | |
| Corporate home | `CorporateHome.jsx` → `.corporate-home__mark` | `S` на зелёном квадрате | отдельный вопрос владельцу |
| App install banner | `AppInstallBanner.jsx` → `.app-install-banner__logo` | `S` | |
| Offline page | `public/offline.html` → `.logo` | `S` | статическая страница |

Рекомендуемый UI размер mark: **28–32px** (display), hit-area ≥44px.

### B. Favicon / PWA / splash (сейчас `public/icons` → build `pwa-icons`)

| Место | Файл | Путь ассета |
|-------|------|-------------|
| HTML favicon | `index.html` | `%BASE_URL%pwa-icons/icon-192.png` |
| Apple touch | `index.html` | `pwa-icons/apple-touch-icon.png` |
| Launch splash в `#root` | `index.html` | `pwa-icons/icon-192.png` |
| Manifest | `public/manifest.webmanifest` | `icon-192`, `icon-512`, `icon-maskable-192`, `icon-maskable-512` |
| Source icons (git) | `public/icons/*` | `icon-48/64/128/192/512`, `icon-maskable-*`, `apple-touch-icon`, `icon-master` |
| Build copy | `vite.config.js` | `dist/icons` → `dist/pwa-icons` (Apache `/icons/` reserved) |
| Service worker cache + push | `public/sw.js` | `pwa-icons/icon-192/512`, `apple-touch-icon` |
| Auth loading | `AuthLoadingScreen.jsx` | `pwa-icons/icon-192.png` |
| Web Push notification icon | `webPushSubscriptionService.js` | `pwa-icons/icon-192.png` |

`public/pwa-icons/` в репо **нет** — появляется при `build`. Менять source = `public/icons/*`.

`favicon.ico` в репо **не найден** — только PNG 192.

### C. Уже brand-compliant (не трогать в sunmark-rollout без нужды)

| Место | Ассет |
|-------|--------|
| `CareersHeader` | `logo-primary.png` |
| `CareersFooter` | `logo-on-green.png` |
| Careers hub/detail placeholders | `pattern-tile.svg` |
| Apply success | `icon-sunmark.png` (+ check badge) — **кандидат** заменить на `icon-sunmark-on-white.png` в том же PR или follow-up |
| Design reference | `design-reference/shugyla-career-concept.html` (встроенные data-URI) |

### D. Вне scope / не логотип

`PlatformIcons.jsx` (UI glyphs), procurement/HR icons — не sunmark.

---

## Рекомендация размеров (следующий PR)

| Назначение | Размер | Источник |
|------------|--------|----------|
| UI mark (sidebar / desktop logo) | 28–32 CSS px (`src` 64–128) | `icon-sunmark-on-white.png` |
| Favicon tab | 48 / 64 / 128 / 192 | ресайз с on-white |
| PWA any | **192**, **512** | ресайз с on-white |
| Apple touch | 180 | ресайз с on-white |
| Maskable | **192**, **512** | on-white + **больший** safe-zone padding (~20–25% от края; знак в центральных ~80% по maskable spec) |
| Master | 1024 | опционально из source/on-white |

Пайплайн: `icon-sunmark-on-white.png` → скрипт генерации `public/icons/*` → verify static paths → JSX замена `S` на `<img>`.

---

## Gaps / риски

1. Текущие `public/icons/*` — старая палитра/геометрия (4-bit colormap); не совпадают с новым sunmark.  
2. Careers success ещё на `icon-sunmark.png` (legacy/чёрное превью) — визуальный диссонанс с on-white.  
3. Corporate mark на **зелёном** квадрате — sunmark-on-white ок, но фон квадрата нужно убрать/пересмотреть.  
4. Maskable: нельзя просто scale-to-fill 512 — обрежут лучи на Android.

---

## Non-goals этого шага

- Правки platform JSX / Login / Corporate / offline.  
- Перегенерация `public/icons` / `sw.js` / manifest.  
- Ослабление careers restyle C1–C4.  
- Коммит без команды владельца.

---

## Вопросы владельцу (макс. 4)

1. **Maskable safe-zone:** ок ~20–25% белого padding вокруг знака для `icon-maskable-192/512`, или плотнее?  
2. **Заменить `icon-sunmark.png`:** careers success и любые ссылки перевести на `icon-sunmark-on-white.png`, или оставить legacy файл как alias/копию?  
3. **Corporate (`shugyla-market.kz`):** тоже sunmark вместо «S», или только platform + PWA?  
4. **`favicon.ico`:** нужен ли отдельный `.ico` (16/32), или достаточно PNG 192 как сейчас в `index.html`?

---

## Черновик следующих PR (не делать сейчас)

| PR | Фокус |
|----|--------|
| S1 | Регенерировать `public/icons/*` (+ maskable) из `icon-sunmark-on-white.png`; verify paths |
| S2 | PlatformDesktopLogo + PlatformSidebar (+ login/offline) — `<img>` sunmark |
| S3 | Corporate + AppInstallBanner; success → on-white; optional favicon.ico |
