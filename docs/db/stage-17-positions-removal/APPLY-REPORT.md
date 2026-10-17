# Stage 17 phase B — apply report (2026-10-17)

Applied on prod (`cxadzerxndlscwvdaymk`) via MCP migration `drop_positions_and_position_groups`, one transaction.
The first attempt rolled back atomically: `position_structure_private.position_to_json(positions)` depended on the table
(a private helper schema with 9 functions used only by `position_structure_*`); the schema was added to the script.

Postcheck: tables `positions` / `position_groups` = 0, `academy_users.position*` columns = 0, `position_structure*`
functions and schema = 0, `positions.*` permissions = 0, active users = 3, admin role permissions = 33 (was 35 − 2).
Advisors: no new findings (only the known intentional SECURITY DEFINER warnings).
