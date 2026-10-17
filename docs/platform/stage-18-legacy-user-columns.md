# Этап 18 — лишние колонки пользователей

Удалены колонки `academy_users.work_mode`, `salary_calculation_type`, `payroll_participation`, `work_location_id`:
они нужны были только удалённым модулям графика и зарплаты (решение владельца 2026-10-17).

- Код: убраны из сессии, нормализации сотрудника, адаптеров, списка и Edge Functions
  (`admin-create-employee`, `admin-update-employee` — значения от старых клиентов игнорируются, `admin-list-employees` через общий select).
  Из `employeeData.js` удалены неиспользуемые справочники и хелперы режима работы / типа расчёта / участия в ведомости.
- База: `docs/db/stage-18-legacy-user-columns/` (preflight → apply → postcheck).
- Таблица `platform_work_locations` в этот этап не входит (отдельное решение).
