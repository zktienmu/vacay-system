# Design System — Vaca

## Product Context
- **What this is:** Internal leave management system for Dinngo
- **Who it's for:** ~15 employees, Web3 company, wallet-based auth
- **Space/industry:** Internal tooling, HR/leave management
- **Project type:** Web app / dashboard

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian
- **Decoration level:** Minimal — typography and spacing do all the work
- **Mood:** Precision instrument. Confident, warm, editorial. Not a template — built with intention.
- **Anti-patterns:** No purple gradients, no bubbly border-radius, no uniform colored-circle icons, no centered-everything layouts

## Typography
- **Display/Hero:** Instrument Serif — adds gravitas and warmth, contrarian choice for a Web3 tool
- **Body/UI:** Geist — already loaded by Next.js, clean, modern, excellent readability
- **Data/Tables:** Geist (tabular-nums) — serial numbers, dates, balances
- **Code/Mono:** Geist Mono — wallet addresses, timestamps, serial numbers
- **Loading:** Instrument Serif via Google Fonts `<link>`, Geist via next/font (already configured)
- **Scale:**
  - Hero: 64px / 4rem
  - H1: 36px / 2.25rem
  - H2: 24px / 1.5rem
  - H3: 20px / 1.25rem
  - Body: 16px / 1rem
  - Small: 14px / 0.875rem
  - Caption: 12px / 0.75rem
  - Micro: 11px / 0.6875rem

## Color
- **Approach:** Restrained — 1 accent + neutrals, color is rare and meaningful
- **Accent:** `#FF5C00` (burnt orange) — warm, energetic, distinctly not AI-slop blue/purple
- **Accent hover:** `#E65200`
- **Primary text:** `#0A0A0A`
- **Secondary text:** `#71717A`
- **Tertiary text:** `#A1A1AA`
- **Background:** `#FFFFFF`
- **Background subtle:** `#F7F7F8`
- **Background muted:** `#EFEFEF`
- **Border:** `#E4E4E7`
- **Semantic:**
  - Success: `#16A34A`
  - Warning: `#D97706`
  - Error: `#DC2626`
  - Info: `#2563EB`
- **Dark mode:**
  - Accent stays `#FF5C00`, hover `#FF7A33`
  - Background: `#0A0A0A`
  - Background subtle: `#18181B`
  - Background muted: `#27272A`
  - Border: `#27272A`
  - Text: `#FAFAFA`
  - Secondary text: `#A1A1AA`
  - Tertiary text: `#71717A`

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Grid-disciplined — strict columns, predictable alignment
- **Max content width:** 1280px (7xl)
- **Border radius:** 0px everywhere — sharp corners are a deliberate design choice
- **Exceptions:** Only pill shapes for specific badges where semantic meaning requires it

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150ms) medium(250ms)
- **Rules:** No bouncing, no spring physics, no entrance animations. Expand/collapse at 150ms ease-out.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-25 | Initial design system | Industrial/Utilitarian aesthetic with Instrument Serif headings, burnt orange accent, zero border-radius. Created by /design-consultation. |
