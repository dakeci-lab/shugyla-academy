# Этап A — Убрать смену дня до «Нет смены» (DELETE)

**Статус:** реализация сделана, готово к ревью (коммит/PR — по запросу владельца).  
**Дата:** 2026-08-20.  
**Опора:** `docs/hr/audit-clear-future-shifts-on-resignation.md`

---

## Цель

Админ в модалке «Редактирование смены» может выбрать **«Нет смены»** → строка в `academy_employee_shifts` **удаляется**. Ячейка календаря снова показывает «Нет смены» (`shift == null`).

## Правило

| Условие | Результат |
|---------|-----------|
| Нет actual start/end и нет geo check-in/out | DELETE разрешён (если дата в employment window) |
| Есть факт attendance | DELETE **запрещён** (409 / UI без пункта) |
| «Нет смены» | отсутствие строки, **не** новый enum-статус |

## Что сделано

- Edge `delete_shift` + `assertShiftDeleteAllowed`
- Cloud / local adapters + `deleteEmployeeShiftDay`
- UI: `SHIFT_DAY_CLEAR` / пункт «Нет смены» → `enqueueClear`
- `npm run verify:employee-schedule-delete`

## Критерии приёмки

### Verify

```bash
npm run verify:employee-schedule-delete
```

### Ручной чеклист

1. Открыть график сотрудника, день с планом **без** check-in/out → «Нет смены» → сохранить → ячейка пустая.
2. День **с** фактом прихода/ухода → пункта «Нет смены» нет; подсказка видна; факт по-прежнему редактируется.
3. День уже пустой → открыть модалку → пункта «Нет смены» нет (нечего удалять).
4. Дата после `terminated_at` по-прежнему залочена (этап A окно не расширяет).

## Non-goals (этапы B/C — не в этом PR этапа A)

- ~~Автоочистка при `deactivateEmployee` / увольнении~~ → **этап B:** `docs/hr/plan-clear-shifts-on-termination.md`
- Bulk «Очистить график с даты…» (этап C)
- Unlock правок дней `> terminated_at`
- Новый статус в CHECK constraint
- Миграции схемы
- Правки payroll-формул
