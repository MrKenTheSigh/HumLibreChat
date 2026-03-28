# Phase 5 Slice 2: Admin Usage Summary API

## Goal

Provide a lightweight admin summary API that aggregates recent transaction activity into totals suitable for dashboard cards.

## Out Of Scope

- no time-series charting
- no per-day buckets
- no cohort analytics
- no forecasting

## API Contract

Route:

- `GET /api/admin/usage/summary`

Suggested query params:

- `userId`
- `model`
- `context`
- `tokenType`
- `dateFrom`
- `dateTo`

Suggested response:

```ts
type AdminUsageSummaryResponse = {
  transactionCount: number;
  uniqueUsers: number;
  totalTokenValue: number;
  totalRawAmount: number;
  totalInputTokens: number;
  totalWriteTokens: number;
  totalReadTokens: number;
  newestTransactionAt: string | null;
  oldestTransactionAt: string | null;
};
```

## Aggregation Rules

- `totalTokenValue` is the primary credit-movement metric
- `totalRawAmount` is a secondary operational metric
- token counters should sum nullable numeric fields safely
- summary must use the same filters as Slice 1 where possible

## Files Expected To Change

- `packages/api/src/admin/usage.ts`
- `packages/api/src/admin/usage.spec.ts`
- `packages/api/src/admin/index.ts`
- `api/server/routes/admin/usage.js`
- `api/server/routes/__tests__/admin-usage.spec.js`
- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/types/queries.ts`
- `client/src/data-provider/Admin/queries.ts`

## Acceptance Criteria

- admin can fetch one summary payload for the current filters
- summary numbers reconcile with the transaction list for the same filter set
- no new persistence layer is introduced

## Test Scope

- backend aggregation tests
- route tests
- no UI in this slice

## Cut Line

This slice is done when the admin dashboard can consume a stable summary payload built directly from `Transaction`.
