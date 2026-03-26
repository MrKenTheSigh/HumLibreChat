# Slice Spec: Admin User Plan Assignment

## Goal

Allow an admin to assign or clear an `AdminPlan` on a user account from the admin user detail flow.

This slice does not enforce the plan during chat execution. It only stores and surfaces assignment state.

## Out Of Scope

- Automatic balance resets on assignment
- Bulk assignment
- Runtime chat restriction
- Permanent ban state
- Usage dashboards

## User Story

An admin can inspect a user and assign a plan that will later be enforced by Phase 3.

## Backend API Contract

### Endpoints

`POST /api/admin/users/:userId/plan`

Request body:

```json
{
  "planId": "plan-id"
}
```

`DELETE /api/admin/users/:userId/plan`

### Suggested Response Shape

```json
{
  "userId": "user-id",
  "plan": {
    "id": "plan-id",
    "name": "Pro",
    "slug": "pro"
  },
  "assignedAt": "2026-03-25T00:00:00.000Z"
}
```

For clear:

```json
{
  "userId": "user-id",
  "plan": null,
  "assignedAt": null
}
```

### Validation Rules

- target user must exist
- `planId` must refer to an existing plan
- assignment should store plan id and assigned timestamp on the user

### Error Cases

- `400` invalid payload
- `401` unauthenticated
- `403` non-admin
- `404` unknown user
- `404` unknown plan

## Data Source

Extend existing `User` schema with:

- `adminPlanId`
- `adminPlanAssignedAt`

Read existing:

- `AdminPlan`

## Proposed Implementation Files

### Data Schemas

- `packages/data-schemas/src/schema/user.ts`
- `packages/data-schemas/src/types/user.ts`

### Backend

- `packages/api/src/admin/users.ts`
- `packages/api/src/admin/plans.ts`
- `packages/api/src/admin/index.ts`
- `api/server/routes/admin/users.js`

### Shared Client Data Layer

- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/types/queries.ts`

### Frontend

- `client/src/data-provider/Admin/mutations.ts`
- `client/src/data-provider/Admin/queries.ts`
- `client/src/components/Admin/Users/AdminUserDetail.tsx`
- `client/src/components/Admin/Users/AdminUserPlanCard.tsx`
- `client/src/locales/en/translation.json`

## UI Contract

### Placement

Inside the admin user detail page.

### Controls

- current assigned plan display
- select input of available plans
- assign button
- clear assignment button
- success and error feedback

### Required Behavior

- refresh user detail after assignment change
- show stable state when no plans exist yet
- do not silently assign the default plan; keep assignment explicit in this slice

## Permissions

- Admin only
- Backend remains the source of truth for valid plan ids

## Acceptance Criteria

1. Admin can assign a plan to a user.
2. Admin can clear a plan from a user.
3. Unknown plan ids are rejected.
4. Updated assignment is reflected in admin user detail.
5. Existing balance behavior remains unchanged.

## Testing Scope

### Backend

- assign success
- clear success
- unknown user
- unknown plan

### Frontend

- current assignment render
- assign success state
- clear success state
- empty-plans state

## Cut Line

This slice is done when an admin can persist plan assignment on a user account. Do not add enforcement or automatic credit mutation here.
