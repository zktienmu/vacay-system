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
- **Vercel serverless: NEVER use fire-and-forget for integration hooks.** The function gets killed right after response is sent, so any pending Slack/Calendar work is lost. Always `await` integrations inside try/catch before returning. Caught Ben's bug (2026-04-15) where cancelled leaves never deleted their calendar event nor posted cancellation announcements. The approve/reject branches had this fix, the cancel branch didn't.
- When adding a new integration side effect (DM to delegate, etc.), update BOTH the `notifyXxx` function in `src/lib/slack/notify.ts` AND the corresponding test in `src/__tests__/lib/slack/notify.test.ts` for postMessage call counts — easy to forget the count assertion gets stale.

## Testing
- When tests fail with 400 but expect 201, check if validation rules (handover_url, date range) reject the request before reaching the intended logic
- The insufficient balance test must pass handover_url if the date range spans 3+ working days, otherwise handover validation fires first
