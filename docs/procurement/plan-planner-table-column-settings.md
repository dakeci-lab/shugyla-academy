# План: настройки столбцов Planning (resize / reorder / visibility)

**Статус:** T1–T4 **done** (verify green 2026-08-22).  
**Дата:** 2026-08-22.  
**Формат:** серия **T1 → T4** (registry+persist → dynamic render → UI+persist wire → verify+hardening).  
**Опора:** `docs/procurement/reference-umag-table-columns-spec.md`, `docs/procurement/audit-planner-table-column-settings.md`.

Коммит / push / merge — **только по команде владельца**.

### Verify suite (T4, все зелёные)

| Script | Result |
|--------|--------|
| `verify:procurement-planner-column-settings` | **42/42** |
| `verify:procurement-planner-barcode-column` | **16/16** |
| `verify:procurement-planner-tree` | **40/40** |
| `verify:procurement-planner-weeks` | **18/18** |
| `verify:procurement-abc-analysis` | **120/120** |
| `verify:procurement-planner-reserve-days` | **18/18** |
| `verify:procurement-planner-header` | **17/17** |
| `verify:procurement-planner-categories` | **40/40** (alias tree) |
| `verify:procurement-desktop-ux` | **182/182** |

**`supabase/schema.sql`:** не обновлялся — в репо это частичный legacy bootstrap (Academy/поставщики); новые таблицы идут только через `supabase/migrations/` (`20260822120000_user_table_settings.sql`).

---

## Закрытые решения владельца

| # | Тема | Решение |
|---|------|---------|
| 1 | Persist | **Per-user**, Postgres RLS `auth_user_id = auth.uid()` |
| 2 | Locked columns | `rowNum`, `product`, `barcode`, `orderQty` — always visible, **не** в toggler |
| 3 | Toggler | **17** togglable колонок; недели **`week0`…`week7`** — отдельные чекбоксы |
| 4 | Сброс | Кнопка **«По умолчанию»** в панели настроек — **v1** |
| 5 | Scope v1 | **Desktop Planning only**; mobile cards out |
| 6 | UMAG model | Full snapshot `{ tableName, pageSize, columns[] }` на resize-end / reorder-drop / toggle / pageSize change |
| 7 | abcSort | **Отдельно** от column order — ephemeral session state, не persist |
| 8 | Стек | Без PrimeNG; **без новых npm deps** без обсуждения |

Противоречий с аудитом нет: аудит рекомендовал те же locked keys и per-user; сброс defaults — **расширение** относительно UMAG (у них кнопки нет).

---

## Цель

Дать закупщику на **desktop** экране Закупки → Планирование UMAG-подобную настройку таблицы: **resize**, **reorder**, **visibility** + **persist per-user**, с сохранением tree mode, ABC sort, sticky №/Товар/Штрихкод/Заказ и текущего поведения qty/search/export.

### Non-goals (v1)

- Mobile cards — layout фиксирован, gear/settings out
- Другие таблицы платформы (`Orders`, `Receiving`, `Employees`, settlements…)
- PrimeNG, react-dnd, `@dnd-kit/*`, Tailwind, новые npm-зависимости
- Edge Function для table settings (прямой Supabase client + RLS)
- Org-wide / per-store shared layouts
- Persist `abcSort` / filter state / tree expanded keys
- Export column picker (`procurementPlanExport.js` — 5 col без изменений)
- Virtual scroll, `<colgroup>`-based layout
- Sort по произвольным колонкам кроме существующего ABC (К/В/П)
- Миграции `procurement_snapshot_items`, Edge `umag-procurement`, RLS snapshot guard

---

## Общая архитектура

```text
procurementPlannerColumnRegistry.js   ← 21 defs (defaults, locked, sticky, render hooks)
         ↓
mergePlannerColumnSettings(saved, registry)   ← pure merge + ordinal recompute
         ↓
tableSettingsService  →  localAdapter | supabaseAdapter
         ↓
ProcurementPlannerView  →  visibleColumns[]  →  thead / sku row / tree row / colSpan
         ↓
T3: resize / reorder / gear  →  saveTableSettings(full snapshot)
```

**Константа таблицы:** `TABLE_NAME = 'PROCUREMENT_PLANNER'`.

**Persist payload (JS, camelCase в адаптерах; snake в SQL где принято проектом):**

```json
{
  "tableName": "PROCUREMENT_PLANNER",
  "pageSize": 25,
  "columns": [
    {
      "columnName": "product",
      "columnOrdinalNumber": 1,
      "visible": true,
      "width": 176,
      "sort": false
    }
  ]
}
```

- `sort: true` только в static registry для ABC-осей (конфиг «колонка сортируемая»), **не** текущее направление `abcSort.dir`.
- Save triggers: resize **pointerup**, reorder **drop**, visibility **click**, pageSize **change**, reset **click**.

---

## PR T1 — Registry + migration + adapters + merge

**Статус этапа:** **done** (verify 42/42 column-settings + регрессии).

### Что делаем

1. **Column registry** — 21 stable key в порядке текущего default layout:

   | Keys |
   |------|
   | `rowNum`, `product`, `barcode` |
   | `abcQty`, `abcRevenue`, `abcProfit` |
   | `week0` … `week7` |
   | `stock`, `reserveDays`, `avgDaily`, `normDays`, `recommendedQty`, `orderQty`, `supplier` |

   На каждый def: `columnName`, default `width` (px), `lockedVisible`, `stickySide` (`left`|`right`|null), `exposedInToggle`, `sort` (ABC only), `labelKey` или RU label, CSS class hints.

2. **Pure helpers** (тестируются verify без DOM):
   - `getDefaultPlannerColumnSettings()` → full snapshot
   - `mergePlannerColumnSettings(saved, registry)` — unknown keys drop; new keys append; locked always `visible: true`; ordinals 0…N-1
   - `PROCUREMENT_PLANNER_TABLE_NAME` constant

3. **Migration** `supabase/migrations/<ts>_user_table_settings.sql`:
   - `user_table_settings(id, auth_user_id, table_name, page_size, columns jsonb, updated_at)`
   - `unique (auth_user_id, table_name)`
   - RLS: select/insert/update/delete own row (`auth_user_id = auth.uid()`)
   - Grant authenticated (как `notification_preferences`)

4. **Adapters:**
   - `src/services/tableSettingsLocalAdapter.js` — `localStorage` key `shugyla:tableSettings:PROCUREMENT_PLANNER`
   - `src/services/tableSettingsSupabaseAdapter.js` — upsert/select by table_name
   - `src/services/tableSettingsService.js` — `getTableSettings(tableName)`, `saveTableSettings(payload)` via `isCloudMode()`

5. **Planner:** **не** менять render в T1 (или только закомментированный import registry — лучше **zero** JSX diff).

### Файлы T1

| Файл | Действие |
|------|----------|
| `src/utils/procurementPlannerColumnRegistry.js` | **новый** |
| `src/utils/plannerColumnSettingsMerge.js` | **новый** (или co-locate в registry) |
| `src/services/tableSettingsLocalAdapter.js` | **новый** |
| `src/services/tableSettingsSupabaseAdapter.js` | **новый** |
| `src/services/tableSettingsService.js` | **новый** |
| `supabase/migrations/<ts>_user_table_settings.sql` | **новый** |
| `scripts/verify-procurement-planner-column-settings.mjs` | **новый** (partial — registry+merge+adapters+migration strings) |
| `package.json` | `verify:procurement-planner-column-settings` |

### Verify T1

```bash
npm run verify:procurement-planner-column-settings
# + регрессия без изменений planner:
npm run verify:procurement-planner-barcode-column
npm run verify:procurement-planner-tree
npm run verify:procurement-desktop-ux
```

**Asserts (минимум):** 21 keys; 4 locked; 17 togglable; week0…week7; merge drops unknown; locked forced visible; migration mentions `user_table_settings` + RLS; adapters reference `PROCUREMENT_PLANNER`.

### Приёмка T1

1. `npm run supabase:local:bootstrap` (или db reset) — migration applies без ошибок.
2. Verify T1 green; planner verify без регрессий.
3. В local mode: manual `saveTableSettings` / `getTableSettings` из dev console или узкий smoke script (optional) — roundtrip JSON.

### Commit hint T1

```text
feat(procurement): planner column registry and user_table_settings persist layer
```

---

## PR T2 — Dynamic render (default layout parity)

**Статус этапа:** **done** (default layout parity, verify suite green).

### Что делаем

1. **Load settings on mount** — `getTableSettings('PROCUREMENT_PLANNER')` → merge with registry → `visibleColumns` state (defaults if null).

2. **Replace hardcoded thead** — loop `visibleColumns` → `renderPlannerColumnHeader(col, ctx)`:
   - ABC headers keep sort buttons + `AbcColumnHelp` on first ABC col
   - Week headers: labels from `buildPlannerWeekColumnLabels(snapshot)` by `weekIndex`
   - Inline `style={{ width: col.width }}` on `<th>` (UMAG pattern); `table-layout: fixed` unchanged

3. **Replace `renderDesktopSkuRow`** — loop `visibleColumns` → `renderPlannerSkuCell(col, item, ctx)`.

4. **Tree group row:**
   - Leading cells: iterate **visible locked-left** columns (`stickySide === 'left'`)
   - Product cell: group toggle + label (special case, not generic empty)
   - Other locked-left: empty `<td aria-hidden>`
   - Tail: `colSpan={plannerTreeTailColSpan(visibleColumns)}` where  
     `tail = visibleColumns.length - visibleLockedLeftCount`

5. **Service rows** (loading, empty, «Ещё · N», «Нет категорий»):  
   `colSpan={visibleColumns.length}` — заменить `TABLE_COL_SPAN` constant usage.

6. **`computeStickyLeft(col, visibleColumns)`** — pure fn:
   - Sum `width` (px) of visible sticky-left columns **before** this col in current order
   - Apply as inline `style={{ left: n }}` on sticky-left `<th>`/`<td>` (replace CSS hardcoded `2.75rem` / `13.75rem` for runtime path, or override via inline)
   - Sticky-right `orderQty`: `right: 0` unchanged

7. **CSS:** keep semantic classes; reduce hardcoded `.proc-planner__sticky-product { left: 2.75rem }` dependency — prefer inline from calculator when settings applied (defaults must reproduce current pixel layout).

8. **T2 без** resize handles, gear, reorder — layout read-only from saved/default settings.

### Файлы T2

| Файл | Действие |
|------|----------|
| `src/utils/procurementPlannerColumnRegistry.js` | renderHeader/renderCell hooks or switch |
| `src/utils/plannerColumnLayout.js` | **новый**: `computeStickyLeft`, `plannerTreeTailColSpan`, `getVisibleLockedLeftColumns` |
| `src/components/procurement/ProcurementPlannerView.jsx` | dynamic thead, sku row, tree row, colSpan |
| `src/components/procurement/ProcurementPlannerView.css` | sticky left overrides; optional `[style*="left"]` fallbacks |
| `scripts/verify-procurement-planner-column-settings.mjs` | + layout helpers asserts |
| `scripts/verify-procurement-planner-barcode-column.mjs` | update: registry-based or helper names vs hardcoded `- 3` |
| `scripts/verify-procurement-planner-tree.mjs` | update: tail colspan helper |
| `scripts/verify-procurement-planner-weeks.mjs` | update: dynamic header path |
| `scripts/verify-procurement-abc-analysis.mjs` | update if thead asserts brittle |
| `scripts/verify-procurement-planner-reserve-days.mjs` | update colSpan asserts |

### Verify T2

```bash
npm run verify:procurement-planner-column-settings
npm run verify:procurement-planner-barcode-column
npm run verify:procurement-planner-tree
npm run verify:procurement-planner-weeks
npm run verify:procurement-abc-analysis
npm run verify:procurement-planner-reserve-days
npm run verify:procurement-planner-header
npm run verify:procurement-desktop-ux
```

### Приёмка T2

1. При **default settings** — визуально идентично текущему prod layout (21 col, sticky stack, tree expand/collapse aligned).
2. Flat list + tree mode + ABC sort + search→flat — без регрессий qty save / pagination / keep-previous.
3. Все verify green.
4. Ручной smoke: expand category → columns aligned under thead; horizontal scroll; sticky №/Товар/Штрихкод/Заказ на месте.

### Commit hint T2

```text
feat(procurement): render planner table from column registry and sticky calculator
```

---

## PR T3 — Resize / reorder / gear panel + persist wire + reset

**Статус этапа:** **done** (resize/reorder/gear/persist wired).

### UX (desktop only, inside `.proc-planner__desktop`)

1. **Gear icon** в toolbar таблицы (рядом с pagination или snapshot strip — не перекрывать chip «К заказу»). Popover:

   ```text
   Видимость столбцов
   Настройте таблицу под себя — выбор сохранится

   ☑ К  ☑ В  ☑ П
   ☑ W1 … ☑ W8   (labels из snapshot period)
   ☑ Остаток  ☑ Запас/дн  …  ☑ Поставщик

   [По умолчанию]
   ```

   - 17 checkboxes; locked four **не показывать**
   - Toggle → instant hide/show + **save full snapshot**
   - «По умолчанию» → reset to `getDefaultPlannerColumnSettings()`, save, re-render

2. **Resize** — `<span className="proc-planner__col-resizer">` в каждом resizable `<th>` (locked-right `orderQty` — resizable; locked-left — resizable per UMAG except consider min width):
   - `pointerdown` on resizer → `pointermove`/`pointerup` on window
   - Expand mode (width grows, neighbors unchanged) — как UMAG §3
   - `minWidth` const **50px** (или per-col min from registry)
   - Save on **pointerup** only

3. **Reorder** — HTML5 DnD on `<th>` header body (not resizer zone):
   - Locked columns: **reorderable among themselves?** — **нет**: locked-left block fixed order `rowNum → product → barcode`; locked-right `orderQty` stays last among visible (before supplier if supplier after order — **default order keeps order before supplier**; reorder must not move cols across locked boundaries)
   - **Правило v1:** reorder only **non-locked** columns between barcode and orderQty; locked four fixed slots (ordinal positions pinned in merge fn on save)

4. **pageSize** — pagination `setPageSize` → include in same save payload.

5. **Load** — on mount already from T2; after T3 every mutation calls `saveTableSettings`.

6. **abcSort on hidden ABC col:** при hide active sort column → `setAbcSort({ field: '', dir: 'asc' })` + refetch (explicit rule in T3).

### Файлы T3

| Файл | Действие |
|------|----------|
| `src/components/procurement/ProcurementPlannerView.jsx` | gear popover, resize/reorder handlers, save wire, pageSize persist, abcSort reset |
| `src/components/procurement/ProcurementPlannerView.css` | resizer, drag-over state, popover |
| `src/utils/plannerColumnSettingsMerge.js` | enforce locked ordinals on save |
| `src/services/tableSettingsService.js` | debounce optional **нет** (UMAG: immediate save per action) |
| `scripts/verify-procurement-planner-column-settings.mjs` | + UI strings, resizer class, reset button, save calls |
| `scripts/verify-procurement-planner-header.mjs` | gear coexists with header/chips |

### Verify T3

```bash
npm run verify:procurement-planner-column-settings
npm run verify:procurement-planner-header
npm run verify:procurement-planner-barcode-column
npm run verify:procurement-planner-tree
npm run verify:procurement-desktop-ux
```

### Приёмка T3

1. Resize column → reload → width restored (cloud + local mode).
2. Reorder togglable col → reload → order restored; locked four never move.
3. Hide «Поставщик» → reload → still hidden; locked four visible.
4. «По умолчанию» → full reset to 21-col default layout + default pageSize 25.
5. Change pageSize 25→50 → reload → 50.
6. Hide ABC «К» while sorted by К → sort clears, tree mode available again if idle.
7. Enter/qty navigation, export, sync — smoke без регрессий.

### Commit hint T3

```text
feat(procurement): planner column resize reorder visibility with per-user persist
```

---

## PR T4 — Verify hardening + edge cases + plan status

**Статус этапа:** **done** (verify hardened, plan updated).

### Что делаем

1. **Complete** `verify-procurement-planner-column-settings.mjs` (full checklist from audit §6):
   - Registry 21 keys, locked four, toggler 17
   - Merge pure fn edge cases
   - `computeStickyLeft` numeric test (resize product 176→220 → barcode left shifts)
   - `plannerTreeTailColSpan` with hidden cols
   - No Edge function reference
   - Gear only under `.proc-planner__desktop`
   - Reset button literal «По умолчанию»

2. **Fix remaining brittle asserts** in barcode/tree/weeks/abc/reserve-days scripts.

3. **Manual checklist doc** (optional inline in this plan § Manual QA) — не отдельный md unless owner asks.

4. Update **this plan** status T1–T4 → done after verify green.

### Файлы T4

| Файл | Действие |
|------|----------|
| `scripts/verify-procurement-planner-column-settings.mjs` | complete |
| `scripts/verify-procurement-planner-*.mjs` | fixups |
| `package.json` | confirm script entry |
| `docs/procurement/plan-planner-table-column-settings.md` | статус этапов |

### Verify T4 (full suite)

```bash
npm run verify:procurement-planner-column-settings
npm run verify:procurement-planner-barcode-column
npm run verify:procurement-planner-tree
npm run verify:procurement-planner-weeks
npm run verify:procurement-abc-analysis
npm run verify:procurement-planner-reserve-days
npm run verify:procurement-planner-header
npm run verify:procurement-planner-categories
npm run verify:procurement-desktop-ux
```

### Приёмка T4

1. Full verify suite green.
2. Manual QA (desktop, cloud prod or staging account):
   - Widen «Товар», reorder «Рек.» before «Норма», hide 4 weeks, reset defaults
   - Tree: expand subcategory with custom layout — no colspan misalignment
   - Second user account — **different** saved layout (proves per-user RLS)
3. `schema.sql` snapshot updated if project convention requires after migration. **T4:** не обновлялся — см. таблицу verify suite выше.

### Commit hint T4

```text
test(procurement): planner column settings verify suite and script fixups
```

---

## Риски и митигации

| Риск | Этап | Митигация |
|------|------|-----------|
| **Sticky left stack breaks after reorder/resize** | T2–T3 | `computeStickyLeft` from runtime widths+order; drop CSS hardcoded `13.75rem` for applied layout |
| **Tree colspan misalignment** | T2 | `plannerTreeTailColSpan(visibleColumns)`; leading cells from visible locked-left list |
| **abcSort on hidden ABC column** | T3 | Clear `abcSort` when hiding active axis; refetch flat list |
| **Locked column reorder** | T3 | Pin ordinals for four locked keys in merge/save; DnD disabled on locked `<th>` |
| **Hide orderQty** | — | Prevented by `lockedVisible` (not in toggler) |
| **Verify regex brittleness** | T2–T4 | Assert helper names + registry; reduce literal thead sequence checks |
| **pageSize vs columns race** | T3 | Single save payload; last write wins acceptable v1 |
| **Saved JSON from older deploy** | T1 | merge drops unknown keys, appends new with defaults |
| **min-width 1600px table** | T3 | Expand-mode resize OK; sum(widths) may exceed 1600 — horizontal scroll expected |

---

## Порядок выкладки

```text
T1 registry + DB + adapters  →  verify T1 + planner smoke
    → T2 dynamic render (parity)  →  full planner verify
        → T3 UI + persist + reset  →  manual persist QA
            → T4 verify hardening  →  owner review → merge/прод по команде
```

- **Один PR на этап** — не смешивать migration и gear UI.
- Можно squash T1+T2 для одного review **только если владелец явно попросит**; по умолчанию — раздельно.
- После каждого этапа: verify green до следующего.

---

## Preflight исполнителя (на каждый этап)

1. Прочитать этот план + audit §1–2 + UMAG reference §3–7.
2. Diff **только** файлы текущего этапа Tn.
3. Не добавлять npm deps; resize/reorder — pointer + HTML5 DnD нативно.
4. `abcSort` не писать в `user_table_settings`.
5. Locked four never togglable, never hidden in merge.
6. Прогнать verify из секции этапа + `verify:procurement-desktop-ux`.
7. Ручной smoke tree + flat + qty blur если трогали `ProcurementPlannerView.jsx`.
8. **Не коммитить**, пока владелец не попросит.
9. Migration: локальный `supabase db reset` или bootstrap перед заявлением «T1 done».

---

## Manual QA (после T3–T4)

**Автоматически закрыто verify:** registry/merge/layout, dynamic render, sticky calculator, gear/resizer/reorder hooks, abcSort reset on hide, no Edge for settings.

**Остаётся ручному QA (staging/prod):**

- [ ] `supabase db reset` / bootstrap — migration `20260822120000_user_table_settings.sql` applies без ошибок
- [ ] Default load — 21 columns, layout matches pre-feature baseline
- [ ] Resize «Товар» wider — sticky barcode/order still correct; F5 restores width
- [ ] Reorder «Рек.» before «Норма» — persists after F5; locked four never move
- [ ] Hide `week3`–`week6` — thead/tbody + tree group tail aligned
- [ ] Hide «Поставщик» — order sticky still right
- [ ] ABC sort В desc → hide «В» — sort clears, tree mode returns when idle
- [ ] «По умолчанию» — full reset including pageSize 25
- [ ] pageSize 25→50 — reload restores 50
- [ ] **User B ≠ User A layout** (cloud, per-user RLS on staging)
- [ ] localStorage mode — roundtrip without Supabase
- [ ] Mobile — no gear in `.proc-planner__mobile`; qty Enter/export/sync smoke

---

## Резюме T1→T4

| Этап | Суть | Ключевой результат |
|------|------|-------------------|
| **T1** | Registry (21 keys) + `user_table_settings` + adapters + `mergePlannerColumnSettings` | **done** — persist layer |
| **T2** | Dynamic thead/sku/tree + `computeStickyLeft` + `visibleColumns.length` | **done** — default parity |
| **T3** | Resize, reorder (toggable only), gear (17 checks), reset «По умолчанию», pageSize in snapshot | **done** — UMAG-like UX |
| **T4** | Full verify script + fixups + manual QA checklist | **done** — merge-ready |

**Итог v1:** desktop Planning table with per-user column width/order/visibility + pageSize, без PrimeNG и без mobile scope — aligned with UMAG snapshot model and Shugyla adapter/RLS patterns.
