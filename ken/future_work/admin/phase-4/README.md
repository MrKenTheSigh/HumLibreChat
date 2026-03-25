# Admin Backoffice Phase 4

## Phase Description

Phase 4 adds reporting and operational visibility for administrators.

This phase should start with HumLibreChat's existing transaction data instead of introducing a second usage ledger immediately.

## Planned Outcomes

- usage summary API
- transaction listing API for admins
- usage dashboard in the client
- filtering by user, endpoint, model, and date range

## Data Strategy

- start from `Transaction`
- add summary helpers in backend services if needed
- defer new collections until reporting proves blocked by current data shape

## Exit Condition

This phase is complete when an admin can inspect recent spend and usage patterns from the UI without needing CLI scripts or direct database access.
