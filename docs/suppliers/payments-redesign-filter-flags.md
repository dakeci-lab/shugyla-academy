# «К оплате» — фильтр по поставщику, 3 KPI-плитки, цветные флаги статуса

## 0. Статус: реализовано (2026-09-06)

## 1. Контекст

Владелец сначала собрал и утвердил дизайн в кликабельном HTML-прототипе
(Artifact, несколько раундов правок — цвета флагов, серая полоса групп,
начертание текста), затем попросил перенести финальную версию в реальный
код раздела «Закупки → Расчёты → К оплате»
(`/platform/supplier-finance?tab=payments`).

Три изменения:

1. Строка поиска «Поиск по поставщику» заменена кнопкой-фильтром рядом с
   кнопкой синхронизации: клик открывает попап (поиск + чекбоксы
   поставщиков + «Сбросить»/«Применить»).
2. Плитка «Оплачено · месяц» убрана — остались Долг / Просрочено / Сегодня.
3. Колонка «Статус» вместо простого цветного текста «N дн.» — цветные
   флаги-пилюли (белый текст на цветном фоне), группы «Просрочено/Сегодня/
   Предстоящие» оформлены серой полосой-разделителем (не частью таблицы),
   заголовки таблицы — жирным тёмным (не серым мелким капсом), название
   поставщика и сумма по накладной — жирным, срок — как было.

## 2. Изменения

### Кнопка-фильтр (взамен поиска)

- **`src/components/suppliers/finance/SupplierFinancePanel.jsx`** — новый
  `<div className="sfp-panel__filter-slot" ref={setPaymentsFilterSlot} />`
  в `.sfp-panel__sync` (та же строка, что и ↻), рендерится только когда
  активна вкладка «К оплате». DOM-узел передаётся вниз как
  `filterSlot={paymentsFilterSlot}` — тот же приём `headerSlot`, что уже
  использовался в `ProcurementPlannerView`/`ProcurementPage`.
- **`src/components/suppliers/payments/SupplierPaymentsPanel.jsx`** —
  `compactSearch`/`<PlatformSearchToolbar>` убраны из embedded-ветки.
  Новое состояние: `supplierFilter` (применённый `Set` имён), `filterDraft`,
  `filterSearch`, `filterOpen`. Список имён поставщиков (`allSupplierNames`)
  собирается из уже загруженного `view.lists` — без нового запроса.
  Кнопка (`PlatformFilterButton`, тот же компонент с бейджем-счётчиком, что
  в «Сотрудниках»/«Планировании») + попап (`SupplierFilterPopover`, новый
  локальный компонент — поиск, чекбоксы, клик вне/`Esc` закрывает) портятся
  (`createPortal`) в `filterSlot`. Активный фильтр показывается отдельной
  строкой чипов под топбаром (убрать по одному или «Очистить всё»).
  `CompactPaymentSchedule` принимает `supplierFilter` вместо `search` —
  фильтрует по точному имени вместо substring-поиска (соответствует UX
  «выбрал из списка», а не «ввёл текст»).

### KPI-плитки

- **`SupplierFinancePanel.jsx`** — `KpiTile` «Оплачено · месяц» удалена;
  «Долг» получила `tone="debt"`. Мёртвые `monthLabel`/`paidUnavailable` и
  неиспользуемый импорт `monthLabelFromDateKey` убраны.
- **`SupplierFinancePanel.css`** — grid 4→3 колонки; `--debt` (зелёный
  `#2cbe60`), `--overdue`/`--today` перекрашены в `#f61046`/`#ffae1e` —
  те же коды, что и у флагов в списке, чтобы цвет читался как один язык.

### Флаги статуса + серые разделители групп + типографика

- **`SupplierPaymentsPanel.css`**:
  - `.spo-compact__head` (шапка таблицы) — цвет с приглушённо-серого на
    `var(--color-text)`, размер увеличен до 14px (жирность там уже была).
  - `.spo-compact__section-head` — `font-weight: 400` (было 700), фон
    `#f1f5f9` (серая полоса вместо почти-белой), `display:flex;
    justify-content:space-between`; название секции — в своём `span` с
    цветом по типу (`--overdue`→красный, `--today`→оранжевый,
    `--upcoming`→зелёный), сумма — в своём `span` справа.
  - `.spo-compact__status` — было просто цветным текстом, стало пилюлей
    (`border-radius:999px`, сплошной цветной фон, белый текст):
    просрочено `#f61046`, сегодня `#ffae1e`, предстоящие `#2cbe60`.
    «Без срока» (missing) не тронута — остаётся простым серым текстом,
    это не часть цветовой схемы срочности.
  - `.spo-compact__supplier`/`.spo-compact__amount` уже были жирными —
    без изменений, просто подтверждено, что это финальное состояние.
  - Мобильные цвета (`.spo-compact__row--overdue/--today .spo-compact__mobile-meta`)
    и брейкпоинт попапа фильтра приведены к тем же трём hex.

## 3. Не тронуто

- Сама бизнес-логика (`buildPaymentScheduleView`, `deriveObligationStatus`,
  канонический долг, синхронизация UMAG) — только представление.
- Standalone-роут `/platform/supplier-payments` (`embedded={false}`) —
  поиска там не было и не появилось, фильтр-портал не рендерится (нет
  `filterSlot`), карточный вид не менялся.
- `UmagSettlementsPanel`/«Взаиморасчёты» — отдельная вкладка, не затронута.

## 4. Verify

```bash
npm run verify:supplier-finance-compact-payments
npm run verify:supplier-finance-page
npm run verify:supplier-finance-embeddable-panels
npm run verify:supplier-finance-release-blockers
npm run build
```

Четыре существующих verify-скрипта обновлены под новую вёрстку:
- `verify-supplier-finance-compact-payments.mjs` — Case 1/4 больше не
  требуют, чтобы `<CompactPaymentSchedule>` было первым узлом сразу после
  `embedded ? (` (теперь перед ним стоит портал фильтра) и чтобы заголовок
  секции был одной текстовой строкой (теперь три `span`). Заодно исправлены
  Case 3/«empty sections» — они были рассинхронизированы с кодом ещё ДО
  этой сессии (проверено на чистом `HEAD` через `git stash`), не связаны с
  текущей задачей.
- `verify-supplier-finance-page.mjs` — Case 3/4 ожидали ровно 4 `<KpiTile>`
  и `summary.paidThisMonth.amount` — обновлены на 3 плитки без «Оплачено».
- `verify-supplier-finance-embeddable-panels.mjs` — тот же relax, что и в
  compact-payments (Case про «первый узел после `embedded ? (`»).
- `verify-supplier-finance-release-blockers.mjs` — F-2 проверял, что
  `paidUnavailable` остаётся в панели; теперь проверяет обратное — что
  panel НЕ ссылается на `paidThisMonth` вовсе, а сам guard
  (`status: 'unavailable'`) остаётся в сервисе (RLS-safety fix не в UI,
  а в data layer — он не пострадал от удаления плитки).

21+29+23+16 = 89 проверок зелёные; плюс полный прогон всех остальных
`verify-supplier-finance-*`/`verify-supplier-payments`/
`verify-umag-sync-settlements-ux` скриптов — без регрессий.

Браузерный mount-тест (временный экспорт `CompactPaymentSchedule`/
`SupplierFilterPopover`/`CompactColumnsHead`, временный роут
`/dev-sandbox-employees`, оба возвращены/удалены после проверки) на
фиктивных данных (2 просроченных / 2 сегодня / 2 предстоящих у 4
поставщиков) — фильтр открывается, поиск внутри попапа работает, выбор +
«Применить» сужает список и корректно пересчитывает суммы по группам,
бейдж-счётчик на кнопке фильтра обновляется, флаги трёх цветов и серые
разделители групп рендерятся как в утверждённом прототипе, ошибок в
консоли нет.

## 5. Затронутые файлы

Изменены: `src/components/suppliers/finance/SupplierFinancePanel.jsx`,
`src/components/suppliers/finance/SupplierFinancePanel.css`,
`src/components/suppliers/payments/SupplierPaymentsPanel.jsx`,
`src/components/suppliers/payments/SupplierPaymentsPanel.css`,
`scripts/verify-supplier-finance-compact-payments.mjs`,
`scripts/verify-supplier-finance-page.mjs`,
`scripts/verify-supplier-finance-embeddable-panels.mjs`,
`scripts/verify-supplier-finance-release-blockers.mjs`.

Миграций и Edge Function нет — задача полностью фронтенд.
