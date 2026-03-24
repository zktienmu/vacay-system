# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vaca is a leave management system for Dinngo, built with Next.js 16 (App Router), React 19, TypeScript, Supabase, and SIWE (Sign-In with Ethereum) authentication.

## Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npx vitest run       # Run all tests (225 tests, 11 files)
npx vitest run src/__tests__/lib/leave/balance.test.ts  # Single test file
npx vitest --watch   # Watch mode
vercel --prod        # Deploy to production
```

## Architecture

### Auth Flow (SIWE + iron-session)
1. `/api/auth/nonce` → 16-byte hex nonce (5-min TTL, single-use)
2. Client signs SIWE message with wallet → `/api/auth/verify` validates signature, domain, nonce
3. Session stored in encrypted httpOnly cookie (`vaca_session`, 8-hour maxAge)
4. **Every request re-validates** role/department/is_manager from DB via `withAuth` middleware — session updates automatically if employee record changes

### Authorization Model (3 layers)
- **Role**: `admin` | `employee` — admins access employee management, holidays, reports
- **Department**: `engineering` | `admin` — organizational grouping
- **Manager flag**: `is_manager: boolean` — any manager from any department can approve/reject leave

Middleware wrappers in `src/lib/auth/middleware.ts`:
- `withAuth` — requires valid session, re-syncs DB state
- `withAdmin` — requires `role === "admin"`
- `withApprover` — requires `role === "admin"` OR `is_manager === true`

### Route Guard (`src/proxy.ts`)
Next.js 16 "proxy" convention (replaces deprecated middleware.ts). Handles:
- CSRF origin validation on state-changing requests (POST/PATCH/PUT/DELETE)
- Rate limiting (auth: 5/min, API: 60/min per IP, in-memory)
- Security headers (CSP, HSTS, X-Frame-Options)
- Auth redirects (no session → /login)

**Note**: CSP is tightened to allow only required origins (WalletConnect, Reown, self).

### Database Pattern
- Uses Supabase **service_role key** which bypasses RLS — authorization enforced at API layer
- All non-admin queries MUST include `employee_id` filters to prevent cross-tenant access
- `src/lib/supabase/queries.ts` is the single data access layer (`"server-only"` enforced)
- Wallet addresses are always checksummed via `viem.getAddress()`

### Leave Business Logic (`src/lib/leave/`)
- **Anniversary-based periods** (not calendar year) — leave resets on employment anniversary
- Working days exclude weekends + public holidays from DB
- Leave ≥3 working days requires `handover_url` (enforced in API + frontend)
- Balance checks skip `unpaid` and `official` leave types
- Delegate receives Slack notification on approval

### Integrations (`src/lib/integrations/hooks.ts`)
Fire-and-forget pattern — failures don't break the main flow:
- **On create**: Slack DM to all approvers (admins + managers)
- **On approve**: Slack DM to employee + delegate, Google Calendar event, channel post
- **On reject**: Slack DM to employee, calendar cleanup
- **On cancel**: Calendar cleanup

### i18n (`src/lib/i18n/`)
Type-safe translations with compile-time key checking via `NestedKeyOf<T>`. Default locale: `zh-TW`. Stored in localStorage (`vaca-locale`). For new UI text that doesn't fit existing translation keys, use inline: `locale === "zh-TW" ? "中文" : "English"`.

### Dark Mode
TailwindCSS 4 class strategy (`dark` class on `<html>`). All UI must include `dark:` variants. Theme stored in localStorage (`vaca-theme`), with system preference as default.

### Page Layout
- `src/app/login/` — public, outside auth layout
- `src/app/(pages)/` — protected by `(pages)/layout.tsx` which checks session and redirects to /login
- Login page must NOT be inside `(pages)/` or it will be blank for unauthenticated users

### Testing Patterns
- Vitest + jsdom + Testing Library
- Mock `server-only` via `src/__tests__/helpers/server-only-mock.ts`
- Mock Supabase/session with factories in `src/__tests__/helpers/mocks.ts`
- `SESSION_SECRET` must be set (≥32 chars) in test setup
- Component tests use `renderWithProviders` wrapper with I18nProvider

## Key Files

| File | Purpose |
|------|---------|
| `src/proxy.ts` | Route guard, CSRF, rate limiting, security headers |
| `src/lib/auth/middleware.ts` | `withAuth`, `withAdmin`, `withApprover` wrappers |
| `src/lib/supabase/queries.ts` | All database operations (server-only) |
| `src/lib/leave/validation.ts` | Zod schemas for all API inputs |
| `src/lib/leave/balance.ts` | Working days calculation, leave balance logic |
| `src/lib/integrations/hooks.ts` | Slack + Google Calendar triggers |
| `src/types/index.ts` | All TypeScript interfaces |
| `src/app/providers.tsx` | Wagmi + React Query + AppKit + I18n providers |

## Environment Variables

Required: `SESSION_SECRET` (≥32 chars), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_REOWN_PROJECT_ID`, `NEXT_PUBLIC_APP_URL`

Optional (graceful degradation): `SLACK_BOT_TOKEN`, `SLACK_LEAVE_CHANNEL_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
## Working Rules

### Plan Mode Default
- 任何非瑣碎任務（3+ 步驟或架構決定）**一定要先進入 Plan Mode**
- 如果事情出錯，立即 STOP 並重新規劃，絕對不要硬推
- Plan Mode 也要用來寫 verification steps，而不只是 build
- 提前寫詳細 spec，減少歧義

### Subagent Strategy
- 大量使用 subagents，保持 main context 乾淨
- 研究、探索、平行分析都丟給 subagent
- 複雜問題一次丟多個 subagent
- 每個 subagent 只負責一件事

### Self-Improvement Loop
- 每次使用者修正後：立即更新 `tasks/lessons.md`
- 為自己寫規則，防止同樣錯誤再次發生
- 無情迭代，直到錯誤率下降
- 每次 session 開頭先 review 相關 lessons

### Verification Before Done
- 絕對不要標記任務完成，除非已經證明它真的有效
- 比較修改前後行為
- 自問：「資深工程師會 approve 這個嗎？」
- 跑測試、看 log、實際展示正確性

### Demand Elegance (Balanced)
- 遇到非瑣碎改動時，先停下來問：「有沒有更優雅的方式？」
- 如果感覺 hacky，就重寫成最優雅的解法
- 簡單 bug 不用過度工程
- 呈現前先自己 challenge 自己的作品

### Autonomous Bug Fixing
- 收到 bug report 就直接修，不要問怎麼修
- 指向 log、error、失敗測試，然後自己解決
- 直接修好 CI 失敗的測試

### Task Management
1. **Plan First**：把 checklist 寫到 `tasks/todo.md`
2. **Verify Plan**：開始前先確認
3. **Track Progress**：完成就 mark
4. **Explain Changes**：每步高階總結
5. **Document Results**：review 區加到 todo.md
6. **Capture Lessons**：修正後更新 lessons.md

### Core Principles
- **Simplicity First**：每次改動都盡量簡單，影響最小
- **No Laziness**：找到根本原因，絕不用臨時 fix，要達到 senior 標準
