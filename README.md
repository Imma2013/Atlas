# Atlas

Microsoft 365 AI Copilot built as a single monorepo.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).

## Repository Layout

```text
.
+- frontend/
+- backend/
+- docs/
+- scripts/
+- CONTEXT.md
+- LICENSE
```

## Why One Repo

- Shared context for frontend/backend changes
- Lower contribution friction
- Simpler deployment and CI
- Easier self-hosted onboarding

## Product Scope

- Teams meeting transcript summaries
- Outlook email summaries
- OneDrive file summaries
- Workspace and web search
- Deck generation and spreadsheet analysis
- Stripe-based usage billing

## Current Model Stack

- Router: `anthropic/claude-haiku-4.5`
- Default tasks: `anthropic/claude-sonnet-4`
- Heavy tasks: `anthropic/claude-opus-4`

## LiteLLM Gateway (Recommended)

Atlas now supports `LiteLLM -> OpenRouter fallback`.

- Preferred: configure LiteLLM and route Anthropic + Gemini through it.
- Fallback: if LiteLLM is not configured, Atlas uses OpenRouter.

Set these env vars in Vercel for LiteLLM:

- `LITELLM_BASE_URL` (example: `https://your-litellm.example.com/v1`)
- `LITELLM_API_KEY` (if your LiteLLM gateway requires auth)
- `LITELLM_ROUTER_MODEL` (default: `atlas-router`)
- `LITELLM_MID_MODEL` (default: `atlas-mid`)
- `LITELLM_BIG_MODEL` (default: `atlas-big`)

OpenRouter fallback env vars (optional):

- `OPENROUTER_API_KEY`
- `OPENROUTER_ROUTER_MODEL`
- `OPENROUTER_MID_MODEL`
- `OPENROUTER_BIG_MODEL`

## Dev Notes

- Read `CONTEXT.md` before starting work.
- Log task handoff with `scripts/sync-context.ps1`.
