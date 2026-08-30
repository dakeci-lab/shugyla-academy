# PR — карточка поставщика: одно поле «Срок оплаты (дней)» вместо 4 типов

## 0. Статус: реализовано, подтверждено реальным рендером и вводом в браузере

## 1. Проблема (запрос владельца)

В карточке поставщика «Условия оплаты» — выпадающий список из 4 значений
(Наличными / Перевод / Отсрочка / Смешанная оплата) плюс отдельное скрытое
поле «Срок отсрочки», которое появлялось только для Отсрочки/Смешанной.
Владелец: раздел «К оплате» — это уже про срок, поэтому в карточке
поставщика вместо типа должно быть одно поле — срок в днях. 0 — оплата сразу
при поступлении, N — оплата через N дней.

## 2. Почему миграция не нужна (разобрано по коду перед реализацией)

Три независимые реализации расчёта срока оплаты — `supplierPaymentObligations.js`
(фронт), `supplierPaymentObligationsService.js` (первичное заполнение) и
`umag-sync/index.ts` (сервер, авторитетный) — уже одинаково сворачивают все
4 типа к двум поведениям:

- `cash`, `transfer` → всегда 0 дней;
- `deferral`, `mixed` → оба используют одно и то же число `deferral_days`;
  «Смешанная оплата» нигде не разбивается на «часть сейчас + часть потом».

Сид-данные (`seed_umag_suppliers.sql`, `umagSuppliersSeed.json`) — все 206
реальных поставщиков: `cash`/`0`. Ни одного `transfer`/`mixed`. Значит поле
«тип» в БД (`platform_suppliers.payment_type`, без CHECK-ограничения) уже
чисто косметическое — расчёт долга/просрочки его не читает вообще.

Схему (`payment_type`/`deferral_days` в `platform_suppliers`, снапшот в
`supplier_payment_obligations`) не трогаем. Меняется только форма.

## 3. Решение

`SupplierForm.jsx`:

- Убран `<select>` «Условия оплаты» на 4 значения.
- Добавлено одно поле «Срок оплаты (дней)» (`type="number"`, `0–365`,
  `placeholder="Не настроено"`) с подсказкой «0 — оплата сразу при
  поступлении товара».
- `derivePaymentTypeFromDays(daysRaw)` — новая чистая функция: `0` → `cash`,
  `N > 0` → `deferral`, пусто/невалидное → `deferral` + `deferral_days: null`
  (то же самое состояние «Требует настройки», что и раньше для Отсрочки с
  пустым сроком). Используется и при сборке payload на сохранение, и для
  строки «Тип» в сводке оплат карточки.
- `supplierToForm()` теперь показывает исходное значение через
  `resolveSupplierPaymentTerms()` — ту же функцию, что уже использует расчёт
  «К оплате» — так что старые `transfer`/`mixed` поставщики при открытии
  карточки корректно показывают своё фактическое число дней, не теряя
  данные.
- `validateSupplierDeferralDays()` больше не завязана на тип — проверяет
  диапазон 0–365 для единственного поля всегда.
- `EMPTY_SUPPLIER_FORM.deferralDays` — `'0'`, не `''`: новый поставщик по
  умолчанию так же «настроен» (0 дней), как раньше по умолчанию был `cash`.

## 4. Проверка

### 4.1 Verify-скрипт

```bash
npm run verify:supplier-form-single-payment-terms-field
```

5 проверок по исходнику: дропдаун убран и заменён единственным полем,
`derivePaymentTypeFromDays`/`validateSupplierDeferralDays` реализуют
правильную редукцию, форма переиспользует `resolveSupplierPaymentTerms` (не
дублирует логику расчёта).

`SupplierForm.jsx` — единственный компонент с реальным JSX в этой цепочке
(`export default function SupplierForm`), поэтому его нельзя импортировать
напрямую в обычный Node (нет JSX-трансформации в `extensionlessResolver`,
и не должно быть — это осознанно узкий loader). Скрипт проверяет исходник
текстово, как и соседние `verify-suppliers-simplify.mjs`/
`verify-supplier-form-focus.mjs`.

### 4.2 Реальный рендер + ввод в браузере (не только текст исходника)

Собрал временный harness (`__scratch_supplier_form_test.jsx/html`, не
коммитились): смонтировал настоящий `SupplierForm` с легаси-поставщиком
`{paymentType: 'transfer', deferralDays: null}`, `isCreate` (чтобы не
дёргать сеть через `SupplierPaymentsSummary`).

| Шаг | Результат |
|---|---|
| Открытие карточки legacy `transfer`-поставщика | поле показывает `0`, `formToSupplierCreatePayload` → `{paymentType:'cash', deferralDays:0}` |
| Реальный ввод `14` в поле (клик + печать, не programmatic set) | `formToSupplierCreatePayload` живьём → `{paymentType:'deferral', deferralDays:14}`, ошибок рендера нет |
| Пустое поле (Node, `formToSupplierCreatePayload({...form, deferralDays:''})`) | `{paymentType:'deferral', deferralDays:null}` — то же «Требует настройки» |

## 5. Затронутые verify-скрипты

- `verify:suppliers-simplify` — две устаревшие проверки (`form keeps payment
  type` искала «Условия оплаты», `form keeps deferral days` искала «Срок
  отсрочки») заменены на проверки нового единственного поля. 44/44.
- `verify:supplier-centralization`, `verify:supplier-payments`,
  `verify:supplier-finance-*`, `verify:receiving-row-display`,
  `verify:umag-first-suppliers` — прогнаны, не затронуты (все читают
  `PAYMENT_TYPE_LABELS`/`formatSupplierPaymentTerms` из `supplierData.js`,
  который не менялся).
- `verify:supplier-form-focus` — падает уже на чистом `main` («filter uses
  version not form»), не мой регресс, не чинил — в реестре стале-скриптов.

## 6. Критерии приёмки

- [ ] В карточке поставщика вместо «Условия оплаты» — одно поле «Срок
      оплаты (дней)».
- [ ] `0` → поставщик оплачивается сразу; в «К оплате» не показывает
      отсрочку.
- [ ] `N > 0` → срок оплаты через N дней, поведение «К оплате» не
      изменилось.
- [ ] Пустое поле → поставщик попадает в баннер «Без срока».
- [ ] Открытие карточки существующего поставщика показывает его текущий
      фактический срок, а не 0 по умолчанию.
