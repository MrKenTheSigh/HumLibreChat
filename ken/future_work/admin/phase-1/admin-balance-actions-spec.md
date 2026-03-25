# Slice Spec: Admin Balance Actions

## Goal

Allow an admin to add credits or set credits for a specific user from the admin user detail flow.

This slice should reuse HumLibreChat's existing global balance model and existing transaction patterns.

## Out Of Scope

- New quota models
- Plan-based quota resets
- Bulk balance operations
- Full financial audit UI
- Ban actions

## User Story

An admin can adjust a user's remaining token credits directly from the admin area.

## Backend API Contract

### Endpoints

`POST /api/admin/users/:userId/balance/add`

Request body:

```json
{
  "amount": 100000
}
```

`POST /api/admin/users/:userId/balance/set`

Request body:

```json
{
  "amount": 500000
}
```

### Behavior

- Requires authenticated admin.
- `add` increments current `Balance.tokenCredits`.
- `set` replaces current `Balance.tokenCredits`.
- Should return the updated balance payload needed by the admin UI.
- Should validate `amount` as a finite integer.

### Suggested Response Shape

```json
{
  "userId": "string",
  "tokenCredits": 500000,
  "updatedAt": "2026-03-25T00:00:00.000Z"
}
```

### Error Cases

- `400` invalid amount
- `401` unauthenticated
- `403` non-admin
- `404` user not found

## Data Source

Use existing:

- `User`
- `Balance`

Do not introduce a new balance collection or new quota engine.

## Proposed Implementation Files

### Backend

- `packages/api/src/admin/balance.ts`
- `packages/api/src/admin/users.ts`
- `api/server/routes/admin/balance.js` or keep under `users.js` if the route wrapper remains small

### Shared Client Data Layer

- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/types/mutations.ts`
- `packages/data-provider/src/types/queries.ts`

### Frontend

- `client/src/data-provider/Admin/mutations.ts`
- `client/src/data-provider/Admin/queries.ts`
- `client/src/components/Admin/Users/AdminUserBalanceCard.tsx`
- `client/src/components/Admin/Users/AdminUserDetail.tsx`
- `client/src/locales/en/translation.json`

## UI Contract

### Placement

Inside the admin user detail page.

### Controls

- current credits display
- add credits form
- set credits form
- success and error feedback

### Safety Rules

- require explicit numeric input
- disable submit while mutation is in flight
- refetch user detail or balance view after success

## Permissions

- Admin only
- Non-admins must not see the form or reach the API

## Acceptance Criteria

1. Admin can add credits to a user.
2. Admin can set credits to an exact value.
3. Invalid input is rejected with a user-visible error.
4. The updated value is reflected in the UI after success.
5. Non-admin requests return `403`.

## Testing Scope

### Backend

- add success
- set success
- invalid amount
- user not found
- non-admin forbidden

### Frontend

- mutation success state
- validation error state
- disabled submit while loading

## Cut Line

This slice is done when a single admin can manually adjust one user's credits. Do not add transaction history, CSV export, or bulk tools here.
