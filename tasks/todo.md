# Todo

## In Progress

## Pending

## Completed
- [x] Fix test mocks: add `department`, `is_manager`, `handover_url` fields
- [x] Fix test cases: add `handover_url` to 3+ day leave test requests
- [x] Fix authorization: manager department filtering on GET /api/leave
- [x] Fix authorization: manager department check on PATCH /api/leave/[id]
- [x] Fix authorization: calendar scoped by role/department
- [x] Fix security: delegate cannot be self
- [x] Fix security: consistent `getClientIp()` across all 7 API routes
- [x] Fix security: Retry-After header on 429 responses
- [x] Fix i18n: add `holidays` + `reports` sections to en.ts and zh-TW.ts
- [x] Fix i18n: holidays page uses `t()` translation
- [x] Fix i18n: reports page uses `t()` translation
- [x] Fix dark mode: holidays page full dark: variants
- [x] Fix dark mode: reports page full dark: variants
- [x] Fix dark mode: ErrorBoundary dark: variants
- [x] Fix error message: Chinese-only handover error → English
- [x] Fix eslint config: ignore .claude/ directory
- [x] All 225 tests passing
- [x] Build succeeds
- [x] Lint clean (0 errors from modified files)
