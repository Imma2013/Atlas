# Stack + Architecture
- Frontend: Next.js 15 + Tailwind CSS.
- Backend runtime: Next.js Server Actions and Route Handlers (no Express).
- Database/Auth/Storage: Supabase.
- Payments: Stripe.
- Hosting: Vercel for app deploys.

## Backend Responsibility Split
- Use Next.js Server Actions for app mutations (create/update/delete).
- Use Supabase for schema, RLS, auth, storage, and SQL migrations.
- Use Supabase client reads where it improves UX and does not bypass security.
- Use Stripe webhooks for payment truth; verify signatures server-side.

## Non-Negotiables
- Schema-first: check `supabase/migrations` before writing DB code.
- RLS-first: every user table needs explicit policies.
- One feature per commit (atomic commit messages).
- No hidden assumptions: if uncertain, verify via docs or CLI output.
- Before starting work, read `CONTEXT.md`.
- After finishing a sub-task, run `scripts/sync-context.ps1`.

## Terminal Roles (6-Core Cockpit)
- T1 Main Codex (Architect): planning, server actions, git flow.
- T2 Codex UI (Builder): Tailwind/shadcn components and UI wiring.
- T3 Gemini (Auditor): security/perf review + web-grounded checks.
- T4 Dev Runner: `npm run dev` (or `pnpm dev`) and runtime errors.
- T5 Supabase CLI: migrations, local DB, RLS validation.
- T6 Stripe CLI: webhook forwarding and payment event tests.

## Hand-Off Protocol
1. Read `CONTEXT.md` first.
2. Implement only your scoped task.
3. Log result with:
   `powershell -ExecutionPolicy Bypass -File scripts/sync-context.ps1 -Terminal "T1" -Task "what changed" -Next "who picks up next"`
4. If blocked, log with `-Blocker`.
5. Next terminal starts only after reading latest `CONTEXT.md`.

## Standard Commands
- Dev: `npm run dev`
- Supabase start: `supabase start`
- Push migrations: `supabase db push`
- Stripe webhook forward:
  `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- Stripe test event:
  `stripe trigger payment_intent.succeeded`

## V1 Blueprint (Authoritative)
Perplexica -> Microsoft 365 Brain -> Stripe-powered SaaS -> Ship v1.

### 2026 Revision (Current)
- Router model default: `anthropic/claude-haiku-4.5`
- Mid model default: `anthropic/claude-sonnet-4`
- Big model default: `anthropic/claude-opus-4`
- Activity data model: `activity_items` + `ai_usage` + `user_plans` (Supabase + RLS)
- Pricing model:
  - Free: 50 actions
  - Starter: 300 actions
  - Pro: 1,000 actions
  - Business/Enterprise: unlimited

### Phase 1: Fork Perplexica (Backend Foundation)
1. Clone:
   `git clone https://github.com/ItzCrazyKns/Perplexica.git`
   `cd Perplexica`
2. Delete web search providers:
   - `/backend/src/search/webSearch.ts`
   - `/backend/src/search/providers/*`
3. Add Microsoft 365 provider folder:
   - `/backend/src/search/providers/microsoft365/`
   - Files: `emails.ts`, `meetings.ts`, `files.ts`, `calendar.ts`, `workspaceSearch.ts`
4. Add Bing provider:
   - `/backend/src/search/providers/bing.ts`

### Phase 2: Routing Logic (OpenRouter-powered)
1. Edit router at:
   - `/backend/src/router/router.ts`
2. Intents:
   - `summarize_meeting`
   - `summarize_email`
   - `summarize_file`
   - `search_workspace`
   - `search_web`
   - `draft_email`
   - `generate_deck`
   - `analyze_spreadsheet`
   - `unknown`
3. Router model (cheap):
   - Llama 3.1 8B or Claude Haiku
4. Router prompt:
   - Classify user request into listed intents
   - Return only intent label
5. Switch logic:
   - Intent -> action handler
   - `default -> askClarifyingQuestion()`

### Phase 3: Multi-Model Architecture (OpenRouter-only)
- Tier 1 Router:
  - Llama 3.1 8B
  - Claude Haiku
- Tier 2 Mid model (default):
  - Claude Sonnet
  - GPT-4.1 Mini
  - Mixtral 8x7B
- Tier 3 Big model (rare):
  - Claude Opus
  - GPT-4.1
  - DeepSeek R1
- Big model use cases:
  - Deck generation
  - Multi-doc synthesis
  - Long reports

### Phase 4: Next.js Backend Structure
Backend under:
- `/app/api/`

Routes:
- Chat brain:
  - `/app/api/chat/route.ts`
- Microsoft Graph:
  - `/app/api/microsoft/auth/route.ts`
  - `/app/api/microsoft/emails/route.ts`
  - `/app/api/microsoft/meetings/route.ts`
  - `/app/api/microsoft/files/route.ts`
  - `/app/api/microsoft/calendar/route.ts`
- Web search:
  - `/app/api/search/web/route.ts`
- Stripe:
  - `/app/api/stripe/checkout/route.ts`
  - `/app/api/stripe/portal/route.ts`
  - `/app/api/stripe/webhook/route.ts`

Lib files:
- `/lib/openrouter.ts`
- `/lib/microsoft.ts`
- `/lib/searchcans.ts`
- `/lib/stripe.ts`
- `/lib/router.ts`
- `/lib/summaries.ts`
- `/lib/deck.ts`
- `/lib/search.ts`

### Phase 5: Microsoft Graph Integration
Required scopes:
- `Mail.Read`
- `Mail.Send`
- `Calendars.Read`
- `Files.Read`
- `Sites.Read.All`
- `OnlineMeetings.Read`
- `User.Read`

Endpoints:
- Emails:
  - `GET /me/messages`
  - `GET /me/messages/{id}`
- Calendar:
  - `GET /me/events`
- OneDrive:
  - `GET /me/drive/root/children`
  - `GET /me/drive/items/{id}/content`
- Teams transcripts:
  - `GET /me/onlineMeetings`
  - `GET /communications/callRecords/{id}/sessions`

### Phase 6: Web Search (SearchCans API)
Pipeline:
1. Query SearchCans API
2. Return top 3-5 results
3. Summarize with Sonnet
4. Provide citations

### Phase 7: Stripe Billing
Plans:
- Free ($0):
  - 50 AI actions
  - Microsoft only
  - No big model
- Starter ($12):
  - 300 AI actions
  - Teams + Outlook + OneDrive
  - Summaries + search
  - Sonnet only
- Pro ($29):
  - 1,500 AI actions
  - Multi-model routing
  - Opus/GPT-4.1
  - Deck generation
  - Spreadsheet analysis
- Business ($99/user):
  - Unlimited
  - Team workspace
  - Knowledge graph
  - SSO

Usage metering:
- 1 AI action = 1 summary OR 1 draft OR 1 search OR 1 deck outline OR 1 spreadsheet analysis

### Phase 8: UX
Prompt example:
- "Summarize yesterday's meeting and turn it into a 5-slide deck."

Expected response:
- Meeting summary
- Action items
- Slide outline
- Open in PowerPoint
- Open in Word
- Open in Excel

### Phase 9: CLI-Ready Checklist
- Fork Perplexica
- Delete web search providers
- Add microsoft365 provider
- Add bing provider
- Add routing intents
- Use Llama 3.1 8B for router
- Use Sonnet for summaries
- Use Opus for deck generation
- Build Next.js backend routes: chat, microsoft, search, stripe
- Integrate Microsoft Graph: emails, meetings, files, calendar
- Use SearchCans API for web search
- Add Stripe billing: Free, Starter, Pro, Business
- Meter AI actions
- Add Open in PowerPoint/Word/Excel links
- Ship v1 fast, iterate later

## Activity Log
- [2026-03-06 17:46:53] [T1] [Done] Task: Added operating protocol to root CONTEXT.md and created sync-context script
  Next: T2 can start UI work after reading CONTEXT.md
- [2026-03-06 18:01:05] [T1] [Done] Task: Added authoritative v1 blueprint (Perplexica -> Microsoft 365 Brain -> Stripe SaaS) to CONTEXT.md with phases, routes, model tiers, Graph scopes, Bing pipeline, and billing plan
  Next: T2/T5 can begin Phase 4 + Supabase schema-first implementation after reading CONTEXT.md
- [2026-03-06 18:51:10] [T1] [Blocked] Task: Implemented Phase 4 scaffold in Perplexica: added Microsoft/Bing/Stripe API routes, OpenRouter+intent router libs, and chat brainMode pipeline
  Next: T5 should set Supabase schema/RLS and T6 should test Stripe webhook flow
  Blocker: next build currently fails on pre-existing @huggingface/transformers missing declaration in src/lib/models/providers/transformers/transformerEmbedding.ts
- [2026-03-06 19:08:33] [T1] [Done] Task: Implemented Phase 5 + 7 with 2026 revisions in Perplexica: Supabase migrations+RLS for activity/usage/plans, Graph transcript pipeline route, usage metering + plan enforcement, Stripe webhook plan sync, and Claude Haiku/Sonnet/Opus defaults
  Next: T5 run supabase db push and validate policies; T6 run stripe listen/trigger and verify plan updates
- [2026-03-06 19:19:44] [T1] [Done] Task: Locked final model stack (Haiku 4.5 / Sonnet 4 / Opus 4), updated pricing quotas (Pro 1000), added plan capability flags, Opus gating logic, and added deploy docs + Teams manifest
  Next: T2 can wire pricing/cards UI from PLAN_CONFIGS; T6 can validate Stripe plan mapping in webhook tests
- [2026-03-06 20:05:33] [T1] [Done] Task: Added MIT LICENSE, root README, and open-source positioning docs (including r/selfhosted draft) with one-repo frontend/backend guidance
  Next: T2 can align UI folder to /frontend and T1 can migrate active app code into /backend or /frontend as chosen
- [2026-03-07 09:39:42] [T1] [Done] Task: Replaced Bing web search with SearchCans (SEARCHCANS_API_KEY), added lib/searchcans.ts, rewired lib/search.ts, removed explicit bing news engine pin in discover route, and updated blueprint references
  Next: Set SEARCHCANS_API_KEY in Vercel and redeploy backend
- [2026-03-07 09:53:49] [T1] [Done] Task: Reduced Vercel lambda bundle risk: lazy-loaded heavy chat dependencies and removed transformers provider registration from model providers index
  Next: Redeploy backend on Vercel and verify lambda size error is resolved
- [2026-03-07 10:57:33] [T1] [Done] Task: Fixed Vercel 500 by making config/db runtime use writable /tmp on serverless and adding safe persistence fallback
  Next: Redeploy backend on Vercel and verify home page no longer returns 500
- [2026-03-07 11:04:46] [T1] [Done] Task: Fixed onboarding loop by auto-marking setupComplete when env model providers or OPENROUTER_API_KEY exist
  Next: Redeploy on Vercel and verify app lands on chat UI without setup wizard loop
- [2026-03-07 11:13:29] [T1] [Done] Task: Removed setup wizard gating in app layout so deployment always opens chat UI directly
  Next: Redeploy on Vercel and verify welcome/setup screens no longer appear
- [2026-03-07 11:28:39] [T1] [Done] Task: Reworked app shell to Chat/Activity/Apps/Billing/Settings tabs, removed setup-plus/new button, removed models section from settings dialogue, and rewired chat client to use OpenRouter brainMode without provider setup
  Next: Redeploy on Vercel and verify new tabs + direct chat flow
- [2026-03-07 12:01:01] [T1] [Done] Task: Implemented dynamic Microsoft Apps flow + OAuth callback, Claude model selector (Haiku/Sonnet/Opus), brainMode chat payload fixes, web-search-first routing fallback, workspace links, and Activity view links
  Next: Redeploy on Vercel and validate Microsoft OAuth + chat + activity in production
- [2026-03-07 12:02:11] [T1] [Done] Task: Pushed commit 116694c: Claude model selector + Microsoft OAuth callback/apps integration + web-first routing/activity links
  Next: Redeploy Vercel and validate OAuth redirect URI + Graph scopes
- [2026-03-07 12:15:54] [T1] [Done] Task: Fixed Microsoft OAuth failure: removed delegated CallRecords.Read.All scope; added clearer call-record permission error messaging
  Next: Redeploy and test Microsoft Connect in Apps
- [2026-03-07 12:51:02] [T1] [Done] Task: Added /api/debug/integrations endpoint and Settings diagnostics panel for Microsoft redirect/OpenRouter Claude model checks
  Next: User runs diagnostics and updates Azure redirect URI + env if mismatch
- [2026-03-07 12:55:05] [T1] [Done] Task: Verified OpenRouter Claude model IDs against live models feed and added fallback retries for Sonnet/Opus/Haiku versioned slugs
  Next: Redeploy and run Settings > Integration Diagnostics
- [2026-03-07 13:45:41] [T1] [Done] Task: Added grounded anti-hallucination system rules, workspace-first source mode with manual web toggle behavior, and visual app logos/cards in Apps tab
  Next: Redeploy and verify workspace/web source behavior + app visuals
- [2026-03-07 14:04:11] [T1] [Done] Task: Migrated LLM gateway to LiteLLM-first with OpenRouter fallback; added provider-aware diagnostics and LiteLLM model defaults/README env guide
  Next: Set Vercel LiteLLM env vars and verify in Settings diagnostics
- [2026-03-07 14:17:54] [T1] [Done] Task: Migrated to direct Anthropic+Gemini providers (no LiteLLM/OpenRouter required), updated model routing defaults, and replaced diagnostics with direct-key connectivity tests
  Next: User sets ANTHROPIC_API_KEY and GEMINI_API_KEY in Vercel then redeploys
- [2026-03-07 15:17:56] [T1] [Done] Task: Fixed chat 400 by relaxing userId validation; hardened Microsoft routes to return 401 for invalid tokens; made Apps data loading resilient to partial API failures; made Discover API fail-soft with empty results
  Next: Redeploy and retest Apps+Chat with workspace source
- [2026-03-07 15:39:04] [T1] [Done] Task: Updated direct-provider model normalization and defaults to current Claude/Gemini slugs; aligned chat selector/defaults and diagnostics model mapping
  Next: Redeploy and run Settings diagnostics to confirm Anthropic/Gemini connectivity
- [2026-03-07 16:03:46] [T1] [Done] Task: Added Gemini models to selector, implemented Anthropic<->Gemini fallback in direct model caller, normalized Anthropic IDs to documented stable slugs, made meetings permission errors fail-soft, and fixed weather fallback URL
  Next: Redeploy and re-test /settings diagnostics + chat/model selection + apps workspace calls
