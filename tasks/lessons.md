# Lessons Learned

## Architecture
- Manager authorization must always include department check — `is_manager` alone is not enough, must verify `employee.department === session.department`
- Calendar and list endpoints need role-based scoping: admin=all, manager=department, employee=self

## Common Pitfalls
- Test mocks must match the full TypeScript interface — missing fields like `handover_url`, `department`, `is_manager` cause silent 400 errors
- Leave requests ≥ 3 working days require `handover_url` — any test creating multi-day leaves must include it
- Always use `getClientIp(req)` from `@/lib/security/rate-limit` for audit logs, never `req.headers.get("x-forwarded-for")` directly
- `.claude/worktrees/` contains build artifacts that can OOM the linter — must be in eslint ignores
- API error messages should be in English (not Chinese) — i18n is frontend-only

## Testing
- When tests fail with 400 but expect 201, check if validation rules (handover_url, date range) reject the request before reaching the intended logic
- The insufficient balance test must pass handover_url if the date range spans 3+ working days, otherwise handover validation fires first
