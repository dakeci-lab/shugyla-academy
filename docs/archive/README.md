# Archive

Documents of modules that were removed from the platform in stages 12–14
(`docs/platform/stage-12-hide-personnel-modules.md`, `stage-13-cleanup.md`, `stage-14-polish.md`):
time tracker, schedule, payroll, HR / recruiting, the careers site and push notifications.

Kept only for history — the code, tables and Edge Functions they describe no longer exist. Use `git log`
on the corresponding paths for the implementation.

| Folder | Subject |
|---|---|
| `careers/` | public careers site restyle |
| `notifications/` | notification foundation, web push, time-tracker dispatch |
| `hr/` | clearing shifts on resignation / from a date |
| `auth/` | team workforce frontend fix |
| `performance/` | workforce / home-summary / scheduler performance stages |
| `platform/` | employee documents, payroll filters, notification chip, schedule toggle |

`docs/hr/login-collision-incident.md` stays in place: `admin-create-employee` still references it.
