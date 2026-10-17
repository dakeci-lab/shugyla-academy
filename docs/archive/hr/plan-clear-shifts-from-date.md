# Этап C — «Очистить график с даты…»

**Статус:** реализация сделана, готово к ревью (коммит/PR — по запросу владельца).  
**Дата:** 2026-08-20.  
**Опора:** аудит + этапы A/B (`plan-clear-shift-day-to-empty.md`, `plan-clear-shifts-on-termination.md`)

---

## Цель

На карточке графика сотрудника — отдельное действие **«Очистить график с даты…»**: удалить плановые смены с `shift_date >= fromDate` **без** факта attendance. Нужно и активным, и уже уволенным (repair хвоста).

## Правило

| Условие | Результат |
|---------|-----------|
| `shift_date >= fromDate`, нет факта | DELETE |
| `shift_date >= fromDate`, есть факт | пропуск (считается в skipped) |
| `shift_date < fromDate` | не трогать |
| Дни `> terminated_at` | **разрешены** для clear-from (в отличие от upsert) |

Не смешивать с «Уволить» (этап B).

## Что сделано

- Shared: `clearPlanShiftsFromDate` (B вызывает его с `inclusive: false`)
- Edge `clear_shifts_from` → counts `{ deleted, skipped_with_attendance }`
- Local / platform зеркало
- UI: кнопка рядом с «Настроить график» + `ClearScheduleFromDateModal` (date → confirm → toast)
- Для уволенных default date = день после `terminatedAt`
- `npm run verify:employee-schedule-clear-from`

## Критерии

```bash
npm run verify:employee-schedule-delete
npm run verify:employee-schedule-terminate-clear
npm run verify:employee-schedule-clear-from
```

### Ручной чеклист (repair)

1. У уволенного с «хвостом» working после даты увольнения открыть график.
2. «Очистить график с даты…» → дата по умолчанию = день после увольнения → подтвердить.
3. Хвост без факта исчез («Нет смены»); дни с фактом и дни до fromDate на месте.
4. У активного: выбрать произвольную дату, убедиться в inclusive-поведении и toast с N/M.

## Non-goals

- Автобэкфилл всех уволенных на проде
- Unlock upsert после `terminated_at`
- Delete смены с фактом
- Менять автоочистку B
