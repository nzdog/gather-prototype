# GTC-FM3-FM5 — Demo page copy fixes + AI prompt NZ cultural override

## Ticket Type
Chore

## Status
Complete

## What Changed

### Part A — Demo page CTA and social proof (FM3)

**A1 — CTA copy updated:**
- Old: "Create your event in minutes. Pay $12 when you're ready to share."
- New: "Your event is waiting. Set it up free — pay $12 when you're ready to invite your people."

**A2 — Social proof line added:**
- "Gather has been used for birthdays, school reunions, Christmas dinners, and end-of-season sports parties."
- Styled as `text-gray-500 text-sm` to match surrounding body copy.

### Part B — AI plan generation prompt NZ override (FM5)

Four prompt additions inserted at the top of `PLAN_GENERATION_SYSTEM_PROMPT`, before the existing RULES section:

1. **NZ CULTURAL OVERRIDE** — Instructs AI to prioritise NZ food/drink culture over British/American defaults
2. **NZ CHRISTMAS RULES** — Enforces glazed ham and roast lamb as iconic mains; turkey secondary only if host-selected
3. **NZ DRINKS** — L&P must appear as first or second non-alcoholic soft drink in every plan
4. **NZ SEASONAL DRINKS** — Suppresses warm/winter drinks for NZ summer events (Nov–Mar)

## Evidence (Executor-Completed)

- **Files changed:**
  - `src/app/demo/page.tsx` — CTA copy + social proof line
  - `src/lib/ai/prompts.ts` — Four NZ override blocks added to `PLAN_GENERATION_SYSTEM_PROMPT`
- **Test plan generation output:** Requires live API call with `ANTHROPIC_API_KEY` — deferred to manual verification per Definition of Done items 6–9
- **Security tests:** 16/16 pass (`npm run test:security`)
- **Commit hash:** _[to be filled after commit]_
