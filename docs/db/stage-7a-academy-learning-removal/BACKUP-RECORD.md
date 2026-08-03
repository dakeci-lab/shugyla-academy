# Backup record (Stage 7A.1)

**Directory (outside Git):** `~/secure-backups/shugyla-platform/20260802T231625Z/`

**Project:** `cxadzerxndlscwvdaymk`  
**Frontend SHA at audit:** `0fe0aad`  
**Created (UTC):** `2026-08-02T23:16:25Z`

## Files + SHA-256

| File | SHA-256 |
|---|---|
| `full_schema.sql` | `f31aa7871ae080e7c7f14ef243e7509ae6f47d66b458a06490925c499cb06095` |
| `full_data.sql` | `140b2f6fa3a35d7332c6d9936a390e95d4c7ee5d45144363bb82f19de96c1239` |
| `roles.sql` | `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` |
| `academy_learning_tables.pgdump` | `763382eb1477a6fba9bcc09eb2e7b8ec5e1848b406880d7d7bdffd8956372c22` |
| `academy_learning_schema_extract.sql` | `b692481659366c197382d0c14d8ff3cf8d740917104dba77f81d7d65cd1627ad` |
| `academy_learning_data_extract.sql` | `b7e227651ae5937dbbd7d2affa6c9d4d9da4fe9188cf7b2af1f109b59e8543cc` |
| `learning_permissions.csv` | `3fe248454fbaf6f0d11a43b40a4ba22b7e4d9c9f2a9ec4173675582fceb89113` |
| `learning_role_permissions.csv` | `6489de305b8a6fad48c2699fbef411571ec909af05bcf47629ef18cc06f0236a` |
| `learning_permissions_restore.sql` | `e3818ed5bcf6aef0436bc5bde56582c9bf16af0c2ad33aef8c6416aff7a9ec2a` |

Re-verify locally:

```bash
cd ~/secure-backups/shugyla-platform/20260802T231625Z
shasum -a 256 -c SHA256SUMS
```

## Restore test summary

Disposable `postgres:17.6` Docker container:

- Restored `academy_learning_tables.pgdump` after stubbing `academy_users` + `academy_set_updated_at` + role `authenticated`.
- Exact learning row counts matched production (7/36/1/0/1/2/0/1/2/0).
- `full_schema.sql` loaded into a second DB: `academy_users`, Standards, `permissions`, `academy_set_updated_at()`, `academy_courses` present (Supabase role ACL lines warn without `anon`/`authenticated`/`service_role` in vanilla Postgres).

## Owner confirmation (GO)

Owner confirmed: no separate Academy app, BI reports, cron jobs, or external scripts using Academy Learning tables. Stage 7B applied — see `STAGE-7B-APPLY-REPORT.md`.
