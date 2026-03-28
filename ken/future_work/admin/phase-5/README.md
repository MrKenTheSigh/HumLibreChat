# Admin Backoffice Phase 5

## Phase Description

Phase 5 adds reporting and operational visibility for administrators.

This phase should start from HumLibreChat's existing `Transaction` data instead of introducing a second usage ledger immediately.

## Planned Outcomes

- usage summary API
- transaction listing API for admins
- usage dashboard in the client
- filtering by user, model, context, token type, and date range

## Reality Check On Current Data

Phase 5 must respect the current `Transaction` shape.

What `Transaction` reliably contains today:

- `user`
- `conversationId`
- `tokenType`
- `model`
- `context`
- `rawAmount`
- `tokenValue`
- token counts such as `inputTokens`, `writeTokens`, and `readTokens`
- timestamps

What it does not reliably contain today:

- a first-class `endpoint`
- a business-facing `channelId`
- a normalized plan snapshot

That means the first reporting pass should be built around `Transaction` as-is.

## Slice Order

1. `admin-transactions-api-spec.md`
2. `admin-usage-summary-api-spec.md`
3. `admin-usage-dashboard-ui-spec.md`

## Default Reporting Policy

- do not introduce a new usage ledger in this phase
- report directly from `Transaction`
- treat `tokenValue` as the source of truth for credit movement
- allow `rawAmount` and token counts for operational debugging
- prefer additive reporting APIs over modifying the chat runtime
- defer endpoint-level reporting unless it can be derived cheaply and deterministically

## Review Standard

Each slice should be approved only if all of the following are true:

- the API shape matches data that actually exists in `Transaction`
- filters are explicit and deterministic
- large result sets use pagination
- admin UI can answer common operational questions without direct database access
- no slice introduces a second ledger or quota engine

## Current Readiness

Phase 5 has been delivered on top of the current transaction model.

What is now in place:

- `GET /api/admin/usage/transactions`
- `GET /api/admin/usage/summary`
- admin usage route in the client at `/d/admin/usage`
- filters for `userId`, `model`, `context`, `tokenType`, `dateFrom`, and `dateTo`
- paginated transaction review without adding a second usage ledger

## Data Strategy

- start from `Transaction`
- add summary helpers in backend services if needed
- defer new collections until reporting proves blocked by current data shape

## Exit Condition

This phase is complete when an admin can inspect recent spend and usage patterns from the UI without needing CLI scripts or direct database access.
