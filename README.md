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

## Dev Notes

- Read `CONTEXT.md` before starting work.
- Log task handoff with `scripts/sync-context.ps1`.