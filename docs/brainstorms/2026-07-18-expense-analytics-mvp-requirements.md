---
date: 2026-07-18
topic: expense-analytics-mvp
---

# Financial expense analytics platform — MVP requirements

## Summary

A personal web platform that auto-syncs the user's Monobank transactions, stores them in Supabase, and lets the user explore spending through a dashboard with an always-visible AI chat panel that answers natural-language questions grounded in the same data. WayForPay-based premium monetization is a deferred phase, not part of this MVP.

## Problem Frame

Monobank's own in-app statistics cover totals and categories, but don't let the user ask ad-hoc questions in natural language — "what did I spend most on last week," "what was an unusual purchase." That gap, not a lack of raw numbers, is the reason to build this rather than keep using the bank's built-in view.

## Key Decisions

- **Personal tool first, multi-user infrastructure from day one.** Only the requester uses it initially, but Supabase auth is built in from the start rather than retrofitted later.
- **Monobank Personal API token, not a corporate/multi-tenant API.** Each user supplies their own personal token; this supports auto-sync via webhook without a partner agreement with Monobank.
- **History window capped at ~31 days on first connect.** Monobank's personal API returns at most ~31 days of statement per request. First connect fetches only that window; everything after accumulates via webhook. Older history is not backfilled.
- **AI agent reads from a precomputed aggregation layer, not live queries or free-form SQL.** A background job recomputes category totals, period comparisons, top merchants, and simple statistical-threshold anomaly flags after every sync. The dashboard and the AI agent both read this same layer, so analytics logic isn't duplicated. For open-ended questions the aggregates don't cover, the agent additionally searches raw transaction descriptions.
- **AI agent is reactive only.** It answers when asked; it does not push proactive alerts in this MVP.
- **AI provider: Claude API (Anthropic).**
- **Premium gate for MVP: AI query limit.** Free tier gets a daily/monthly cap on AI-agent questions; premium removes the cap. This is the feature the WayForPay widget will unlock once that phase ships (see Scope Boundaries).
- **Layout: dashboard with an always-visible AI panel**, not a separate chat page and not a chat-first landing screen — chosen after comparing three wireframe directions.

## Actors

- A1. **User** — connects their Monobank account, views the dashboard, asks the AI agent questions, eventually upgrades to premium.
- A2. **Monobank Personal API** — source of transaction data via statement fetch (first connect) and webhook (ongoing).
- A3. **Supabase** — auth, transaction storage, aggregation-layer storage.
- A4. **AI agent (Claude API)** — answers natural-language questions grounded in the aggregation layer and raw transaction search.
- A5. **WayForPay** (deferred phase) — embedded payment widget that unlocks premium.

## Requirements

**Authentication & data**
- R1. Users register and log in through Supabase auth.
- R2. Each user connects their own Monobank personal API token; the platform stores it per-user in Supabase.
- R3. All fetched transactions are stored in Supabase, scoped per user.

**Monobank sync**
- R4. On first connect, the platform fetches the last ~31 days of transaction history.
- R5. After first connect, new transactions arrive via Monobank webhook and are appended without re-fetching history.
- R6. If the Monobank token is revoked or a sync fails, the platform surfaces a reconnect prompt rather than failing silently.

**Dashboard & AI agent**
- R7. The dashboard shows an always-visible AI chat panel alongside spending visualizations (categories, trends, recent transactions).
- R8. A background job recomputes the aggregation layer (category totals, period comparisons, top merchants, anomaly flags) after each sync.
- R9. The AI agent answers natural-language questions about the user's own spending, grounded in the aggregation layer plus raw transaction search for open-ended questions.
- R10. The AI agent only answers when asked; it does not send proactive notifications in this MVP.
- R11. Free-tier users are capped at a daily/monthly AI-question limit; premium users are not capped.

## Key Flows

- F1. **First-time connect**
  - **Trigger:** User registers and submits their Monobank personal token.
  - **Steps:** Platform validates the token, fetches ~31 days of statement, stores transactions, registers a webhook, runs the aggregation job, shows the dashboard.
  - **Outcome:** Dashboard renders with whatever history is available (may be sparse); the AI agent is immediately usable over that data.
  - **Covers:** R2, R3, R4, R8.

- F2. **Ongoing sync**
  - **Trigger:** Monobank webhook fires for a new transaction.
  - **Steps:** Platform appends the transaction and re-runs (or incrementally updates) the aggregation job.
  - **Outcome:** Dashboard and AI agent reflect the new transaction without user action.
  - **Covers:** R5, R8.

- F3. **AI question**
  - **Trigger:** User asks a question in the AI panel (e.g., "what did I spend most on last week?").
  - **Steps:** Agent checks the user's remaining free-tier quota (if not premium), queries the aggregation layer and/or raw transaction search, composes a natural-language answer.
  - **Outcome:** Answer grounded in real data; quota decremented for free-tier users.
  - **Covers:** R9, R10, R11.

## Acceptance Examples

- AE1. **Sparse first-connect history.** Given a user who just connected Monobank, when they open the dashboard, then trend charts spanning more than ~31 days show an empty/partial "still gathering history" state rather than an error or a blank chart. Covers R4, F1.
- AE2. **Revoked token.** Given a user whose Monobank token was revoked from their banking app, when the next sync attempt fails, then the platform shows a reconnect prompt instead of silently stopping updates. Covers R6.
- AE3. **Free-tier quota exhausted.** Given a free-tier user who has used their daily AI-question quota, when they ask another question, then the agent declines and points to premium rather than answering. Covers R11.

## Scope Boundaries

**Deferred for later**
- WayForPay embedded payment widget and the premium-unlock flow it powers — the AI-query limit is designed now so the gate exists, but the payment mechanism itself ships in a later phase.
- Proactive AI-initiated alerts or anomaly notifications.
- Multiple bank accounts or non-Monobank data sources.

**Outside this product's identity**
- Multi-tenant onboarding polish for unrelated third-party users (self-serve token setup UX, per-tenant rate-limit handling) — the product is built with multi-user infrastructure but isn't being positioned or hardened as a public launch in this phase.

## Dependencies / Assumptions

- Monobank Personal API: 1 statement request per 60 seconds per token, ~31-day max range per request.
- Monobank webhook requires a publicly reachable HTTPS endpoint — the deployment target must be a public URL, not localhost-only, for auto-sync to function.
- Anomaly detection in the aggregation layer uses a simple statistical threshold (e.g., deviation from mean/median), not a dedicated ML model — a working assumption, open to revision.
- UI direction is sourced from 21st.dev component references (via Magic MCP) for the dashboard's visual language.
- Supabase project `ucarbdnmeycvybqodahp` is already provisioned, and CLI/MCP access is configured.

## Outstanding Questions

**Deferred to Planning**
- Exact free-tier AI-question quota (daily vs. monthly, and the number).
- Multi-currency handling for Monobank jars/accounts in different currencies.
- Which specific 21st.dev components/animations to pull in for the dashboard and AI panel.
