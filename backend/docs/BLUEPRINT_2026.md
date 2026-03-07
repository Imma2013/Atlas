# AI 365 Blueprint (2026)

## Model Stack
- Router: `anthropic/claude-haiku-4.5`
- Mid: `anthropic/claude-sonnet-4`
- Big: `anthropic/claude-opus-4`

## Pricing
- Free ($0): 50 actions, Haiku only, no auto-join
- Starter ($19/mo): 300 actions, Sonnet workflows, auto-join enabled
- Pro ($49/mo): 1,000 actions, Opus enabled
- Business ($129/user/mo): unlimited actions, Opus enabled
- Enterprise (custom): unlimited + dedicated infra

## API Surface
- `/api/chat`
- `/api/microsoft/*`
- `/api/search/web`
- `/api/stripe/*`
- `/api/activity`
- `/api/usage`

## Activity Schema
- `activity_items`
- `ai_usage`
- `user_plans`

## Notes
- Stripe webhook remains billing source of truth.
- Teams transcript path uses Graph call records as fallback pipeline.
- Dexie.js/OPFS are not needed for this cloud-first architecture.