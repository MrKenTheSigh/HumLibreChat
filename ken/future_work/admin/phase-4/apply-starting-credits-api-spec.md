# Phase 4 Slice 2: Apply Starting Credits API

## Goal

Expose one narrow admin action for intentional application of a user's current plan starting credits.

## Out Of Scope

- no generic balance policy editor
- no batch provisioning
- no reporting

## API Contract

Route:

- `POST /api/admin/users/:userId/plan/apply-starting-credits`

Auth:

- authenticated admin only

Response:

```ts
type AdminApplyStartingCreditsResponse = {
  applied: boolean;
  reason:
    | 'applied'
    | 'balance_disabled'
    | 'no_plan'
    | 'plan_has_no_starting_credits'
    | 'existing_balance_record';
  tokenCredits: number;
  provisioning: ProvisioningState;
};
```

## Behavior Rules

- route reuses Slice 1 helper
- response succeeds with a stable payload even for no-op outcomes
- actual validation errors still return 4xx/5xx when the user is missing or the request is invalid
- plan assignment path may also reuse the same helper for narrow auto-seed behavior

## Files Expected To Change

- `packages/api/src/admin/provisioning.ts`
- `packages/api/src/admin/users.ts`
- `packages/api/src/admin/users.spec.ts`
- `api/server/routes/admin/users.js`
- `api/server/routes/__tests__/admin-users.spec.js`
- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/types/queries.ts`
- `client/src/data-provider/Admin/mutations.ts`

## Acceptance Criteria

- admin can trigger explicit starting-credit application
- user detail query reflects the updated balance and provisioning metadata
- plan assignment auto-seed uses the same helper and only fires in the approved scenario

## Test Scope

- backend handler tests
- route tests
- no frontend tests in this slice

## Cut Line

This slice is done when the admin action exists, returns stable state, and the automatic plan-assignment auto-seed path is wired to the same policy helper.
