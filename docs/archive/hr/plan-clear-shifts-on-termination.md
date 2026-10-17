# Этап B — Автоочистка будущих смен при увольнении

**Статус:** реализация сделана, готово к ревью (коммит/PR — по запросу владельца).  
**Дата:** 2026-08-20.  
**Опора:** `docs/hr/audit-clear-future-shifts-on-resignation.md`, этап A `docs/hr/plan-clear-shift-day-to-empty.md`

---

## Цель

При «Уволить» (`terminated` + `terminated_at`) одним действием удалить плановые смены с `shift_date > terminated_at` **без** факта check-in/out. Календарь после даты увольнения — «Нет смены», а не залоченные «Рабочий день».

## Правило

| Строка | Действие при увольнении |
|--------|-------------------------|
| `shift_date > terminated_at`, нет attendance | DELETE |
| `shift_date > terminated_at`, есть факт | оставить |
| `shift_date ≤ terminated_at` | не трогать |
| Повторный clear / пустой хвост | идемпотентно, без ошибки |

Restore: удалённые смены **не** воскрешаются (warning в confirm).

## Что сделано

- Shared: `clearPlanShiftsAfterTerminationDate` (+ `isTerminatedEmploymentStatus`)
- `admin-update-employee`: после успешного update при terminated + `terminated_at` → clear
- Local: `clearEmployeeShiftsAfterTermination` из `deactivateEmployee` / local update→terminated
- Confirm «Уволить» / «Восстановить» — тексты про хвост графика
- Schedule reload при смене `terminatedAt` / status на карточке
- `npm run verify:employee-schedule-terminate-clear`

## Критерии приёмки

```bash
npm run verify:employee-schedule-delete          # регресс A
npm run verify:employee-schedule-terminate-clear # этап B
```

### Ручной чеклист

1. Сотруднику заранее проставить working на дни после «сегодня».
2. Уволить → confirm упоминает снятие будущих смен → успех.
3. Календарь: дни после даты увольнения — «Нет смены»; день увольнения и раньше — как были.
4. (Опционально) искусственно оставить факт на будущем дне — после увольнения день с фактом остаётся.
5. Восстановить → warning про невосстановление смен; график после даты пустой, пока не настроят снова.

## Non-goals (этап C и далее)

- ~~Кнопка «Очистить график с даты…»~~ → **этап C:** `docs/hr/plan-clear-shifts-from-date.md`
- Разовый repair UI для старых уволенных
- Unlock ручного upsert дней `> terminated_at`
- Миграции / бэкфилл прода
- Правки payroll-формул
- Delete смены с фактом

## Риски restore

После восстановления админ должен заново настроить график (или этап C). Исторические дни ≤ старой даты увольнения и любые строки с фактом остаются.
