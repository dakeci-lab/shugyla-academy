-- Владелец решил убрать «Рейтинг сотрудников» (мотивация сертификатами за
-- топ-3 признана неэффективной — сама отметка прихода/ухода это прямая
-- обязанность, а не повод для доп. поощрения) вместе со связанным слоем
-- «Управление тайм-трекером»: штрафные баллы рейтинга, журнал опозданий и
-- эскалации админам. Базовая отметка прихода/ухода (нужна для расчёта
-- зарплаты по сменам) не трогается — эта миграция удаляет только то, что
-- питало саму систему рейтинга/эскалаций.
--
-- Реальные данные проверены на боевой БД перед написанием этой миграции:
--   permissions (code='rating.view')        — 1 строка
--   role_permissions (via rating.view)      — 7 строк (каскадно удалятся)
--   time_tracker_violations                 — 95 строк (исторический журнал)
--   time_tracker_escalation_settings        — 1 строка (синглтон-конфиг)
--   notification_templates (эскалации)      — 2 строки
--   notification_rules (эскалации)          — 2 строки
--
-- 95 строк исторического журнала опозданий — единственные реальные данные,
-- которые эта миграция безвозвратно удаляет; это осознанный выбор в рамках
-- полного удаления фичи, а не побочный эффект.

select pg_advisory_xact_lock(202609011200);

-- ---------------------------------------------------------------------------
-- 1. RBAC: право «Рейтинг сотрудников»
-- ---------------------------------------------------------------------------

-- role_permissions.permission_id references permissions(id) on delete cascade —
-- грант удалится сам вместе с правом.
delete from public.permissions where code = 'rating.view';

-- ---------------------------------------------------------------------------
-- 2. Уведомления: правила и шаблоны эскалаций админам
-- ---------------------------------------------------------------------------

-- notification_rules.template_id -> notification_templates(id) on delete
-- restrict — правила удаляются первыми, иначе шаблоны не дадут себя стереть.
delete from public.notification_rules
where code in (
  'time_tracker.rule.admin_clock_in_escalation',
  'time_tracker.rule.admin_clock_out_escalation'
);

delete from public.notification_templates
where code in (
  'time_tracker.admin_clock_in_escalation',
  'time_tracker.admin_clock_out_escalation'
);

-- public.notifications.template_id / rule_id — nullable, on delete set null:
-- исторические записи в инбоксе (если реально отправлялись) не удаляются,
-- просто теряют ссылку на удалённый шаблон/правило.

-- ---------------------------------------------------------------------------
-- 3. Журнал опозданий и настройки эскалации — таблицы полностью убираются
-- ---------------------------------------------------------------------------

drop table if exists public.time_tracker_violations;
drop table if exists public.time_tracker_escalation_settings;

-- ---------------------------------------------------------------------------
-- 4. platform_attendance_settings — убираем колонки баллов/штрафов рейтинга
-- ---------------------------------------------------------------------------

-- Допуски по времени (late_grace_minutes / early_leave_grace_minutes /
-- checkout_wait_minutes) остаются — их читает дневная статистика
-- посещаемости на Главной (OwnerDashboard), это не про рейтинг.

alter table public.platform_attendance_settings
  drop column if exists on_time_points,
  drop column if exists completed_shift_points,
  drop column if exists late_penalty,
  drop column if exists early_leave_penalty,
  drop column if exists absence_penalty,
  drop column if exists missing_check_in_penalty,
  drop column if exists missing_check_out_penalty;
