# Message Credit Usage Slice 4: Quota Summary API

## Goal

Expose a current-period credit summary that supports a user-facing quota/progress bar.

## Out Of Scope

- no refill-policy redesign
- no automatic quota computation from refill settings
- no new admin APIs
- no UI implementation in this slice

## API Contract

Extend `GET /api/balance` with:

```ts
type TQuotaSummary = {
  periodTotalCredits: number;
  periodUsedCredits: number;
  periodRemainingCredits: number;
  usageRatio: number;
  resetAt?: string | null;
};
```

Suggested response:

```ts
type TBalanceResponse = {
  tokenCredits: number;
  autoRefillEnabled: boolean;
  refillIntervalValue?: number;
  refillIntervalUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  lastRefill?: Date;
  refillAmount?: number;
  quota?: TQuotaSummary;
};
```

## Product Rules

- `quota` represents current-period user-facing credit state
- progress bar should be driven only from this quota summary
- do not infer current-period total from refill settings

## Data Strategy

This slice assumes there is a canonical source for current-period total and used credits, whether pre-existing or introduced alongside quota logic.

If that source is not yet finalized, this slice should define the API contract first and defer implementation until the quota source is available.

## Files Expected To Change

- `api/server/controllers/Balance.js`
- `packages/data-provider/src/types.ts`
- optionally `packages/data-provider/src/types/queries.ts` if a richer query type is preferred
- any backend service/helper that resolves current-period quota state

## Acceptance Criteria

- `/api/balance` can return total, used, remaining, and ratio for the current period
- the response remains backward compatible for existing balance consumers
- quota data is explicit enough to drive a progress bar without frontend inference

## Test Scope

- controller/service tests for quota shape
- no UI tests

## Cut Line

This slice is done when the frontend can fetch one authenticated balance payload that fully supports current-period quota display.
