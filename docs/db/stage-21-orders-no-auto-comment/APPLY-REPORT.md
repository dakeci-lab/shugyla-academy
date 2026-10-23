# Stage 21 — apply report (2026-10-23, prod `cxadzerxndlscwvdaymk`)

Applied by hand through the Supabase MCP (`execute_sql`, the DO block of the migration file, one statement).

Preflight: 2 overloads; only the 7-argument one contains the phrase (2 occurrences); SECURITY DEFINER, `search_path=""`.
Rollback tested beforehand on the live definition as a text operation: patch + restore gave an identical definition (md5 equal).

Postcheck: occurrences = 0 for both overloads; `prosecdef = true`; `proconfig` unchanged; EXECUTE grantees unchanged (postgres, service_role).
Existing orders were not touched (644 purchase_orders / 645 receiving_documents still carry the phrase; the frontend treats it as empty).
New orders created from planning after this point get an empty comment.
