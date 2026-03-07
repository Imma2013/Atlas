# r/selfhosted Post Draft

Title: Atlas - MIT-licensed Microsoft 365 AI Copilot (Teams + Outlook + OneDrive)

We just open-sourced Atlas under MIT.

What it does:
- Summarizes Teams meetings and transcripts
- Summarizes Outlook emails and OneDrive files
- Supports workspace + web search
- Generates deck outlines and spreadsheet analysis

Stack:
- Next.js
- Supabase (RLS-first)
- Microsoft Graph
- OpenRouter (Haiku 4.5 / Sonnet 4 / Opus 4)
- Stripe billing

Repo layout:
- `/frontend`
- `/backend`
- `/docs`

License:
- MIT

Looking for feedback on:
- Self-host deployment docs
- Teams/Graph integration edge cases
- Cost/perf tuning for model routing