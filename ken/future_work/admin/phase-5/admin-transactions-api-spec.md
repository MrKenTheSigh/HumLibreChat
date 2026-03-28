# Phase 5 Slice 1: Admin Transactions API

## Goal

Expose a paginated admin-only transaction listing API based directly on the existing `Transaction` collection.

This is the foundation for every later reporting view.

## Out Of Scope

- no charts
- no dashboard cards
- no exports
- no new ledger
- no guaranteed endpoint-level reporting

## API Contract

Route:

- `GET /api/admin/usage/transactions`

Suggested query params:

- `cursor`
- `limit`
- `userId`
- `model`
- `context`
- `tokenType`
- `dateFrom`
- `dateTo`

Suggested response:

```ts
type AdminTransactionItem = {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  conversationId: string | null;
  tokenType: 'prompt' | 'completion' | 'credits';
  model: string | null;
  context: string | null;
  rawAmount: number | null;
  tokenValue: number | null;
  inputTokens: number | null;
  writeTokens: number | null;
  readTokens: number | null;
  createdAt: string | null;
};

type AdminTransactionsResponse = {
  transactions: AdminTransactionItem[];
  nextCursor: string | null;
};
```

## Data Sources

- `Transaction`
- `User`

The first pass should enrich each row with lightweight user identity only.

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

- admin can list recent transactions
- filters work for `userId`, `model`, `context`, `tokenType`, and date range
- pagination is cursor-based
- response includes enough user identity for admin review without another query

## Test Scope

- backend service tests
- route tests
- no UI in this slice

## Cut Line

This slice is done when the admin transaction list exists, is paginated, and is backed only by real stored `Transaction` data.
