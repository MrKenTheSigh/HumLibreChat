# Phase 5 Slice 3: Admin Usage Dashboard UI

## Goal

Add one admin usage page that combines summary cards and a transaction table.

## Out Of Scope

- no charts
- no CSV export
- no inline editing
- no separate detail page per transaction

## UX Contract

The admin should be able to answer these questions from one screen:

- how much recent credit movement happened
- which models are generating activity
- which users are responsible for recent transactions
- whether a transaction came from prompt, completion, or direct credit mutation contexts

## Suggested Route

- `/d/admin/usage`

## Suggested UI Sections

- filter bar
  - `userId`
  - `model`
  - `context`
  - `tokenType`
  - `dateFrom`
  - `dateTo`
- summary cards
  - transaction count
  - unique users
  - total token value
  - total raw amount
- paginated transaction table

## Files Expected To Change

- `client/src/routes/Dashboard.tsx`
- `client/src/components/Admin/AdminView.tsx`
- `client/src/components/Admin/Usage/AdminUsagePage.tsx`
- `client/src/components/Admin/Usage/AdminUsageFilters.tsx`
- `client/src/components/Admin/Usage/AdminUsageSummaryCards.tsx`
- `client/src/components/Admin/Usage/AdminTransactionsTable.tsx`
- `client/src/components/Admin/Usage/__tests__/AdminUsagePage.spec.tsx`
- `client/src/locales/en/translation.json`
- `packages/data-provider/src/types/queries.ts`
- `client/src/data-provider/Admin/queries.ts`

## Behavior Rules

- filters should drive both summary and table queries
- table must paginate
- empty states should be explicit
- UI should not fabricate endpoint/channel data that does not exist in the source records

## Acceptance Criteria

- admin usage page renders summary and table from real APIs
- filters update both sections consistently
- empty results are understandable
- UI remains fast on large datasets by using paginated data

## Test Scope

- focused render and filter-state tests
- no broad snapshots

## Cut Line

This slice is done when an admin can inspect recent usage from one page without leaving the existing client app.
