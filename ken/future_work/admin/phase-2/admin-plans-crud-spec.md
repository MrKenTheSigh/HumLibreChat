# Slice Spec: Admin Plans CRUD

## Goal

Add admin-only CRUD for `AdminPlan`.

This slice introduces the plan model and the admin UI/API required to manage plans, but it does not enforce plans during chat execution.

## Out Of Scope

- Channel CRUD
- User plan assignment
- Automatic balance changes when assigning plans
- Runtime chat restriction
- Usage dashboards

## User Story

An admin can define named plans that later determine which channels a user may access.

## Backend API Contract

### Endpoints

`GET /api/admin/plans`

`GET /api/admin/plans/:planId`

`POST /api/admin/plans`

`PATCH /api/admin/plans/:planId`

`DELETE /api/admin/plans/:planId`

### Suggested Create/Update Request Shape

```json
{
  "name": "Pro",
  "slug": "pro",
  "description": "Default internal power-user plan",
  "enabled": true,
  "isDefault": false,
  "sortOrder": 20,
  "channelIds": ["channel-id-1", "channel-id-2"],
  "notes": "Manual assignment only",
  "startingCredits": 20000
}
```

### Suggested Response Shape

```json
{
  "id": "plan-id",
  "name": "Pro",
  "slug": "pro",
  "description": "Default internal power-user plan",
  "enabled": true,
  "isDefault": false,
  "sortOrder": 20,
  "channelIds": ["channel-id-1", "channel-id-2"],
  "notes": "Manual assignment only",
  "startingCredits": 20000,
  "createdAt": "2026-03-25T00:00:00.000Z",
  "updatedAt": "2026-03-25T00:00:00.000Z"
}
```

### Validation Rules

- `name` required
- `slug` required and unique
- `channelIds` must refer to existing `AdminChannel` documents if provided
- only one plan may have `isDefault=true`
- `startingCredits` is optional and non-negative

### Error Cases

- `400` invalid payload
- `401` unauthenticated
- `403` non-admin
- `404` unknown plan
- `409` duplicate slug

## Data Source

Add new persistent entity:

- `AdminPlan`

No user schema change in this slice.

## Proposed Implementation Files

### Data Schemas

- `packages/data-schemas/src/schema/adminPlan.ts`
- `packages/data-schemas/src/types/adminPlan.ts`
- `packages/data-schemas/src/models/adminPlan.ts`
- `packages/data-schemas/src/schema/index.ts`
- `packages/data-schemas/src/models/index.ts`

### Backend

- `packages/api/src/admin/plans.ts`
- `packages/api/src/admin/index.ts`
- `api/server/routes/admin/plans.js`
- `api/server/routes/index.js`
- `api/server/index.js`

### Shared Client Data Layer

- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/types/queries.ts`

### Frontend

- `client/src/data-provider/Admin/queries.ts`
- `client/src/data-provider/Admin/mutations.ts`
- `client/src/components/Admin/Plans/AdminPlansPage.tsx`
- `client/src/components/Admin/Plans/AdminPlanForm.tsx`
- `client/src/components/Admin/index.ts`
- `client/src/routes/Dashboard.tsx`
- `client/src/locales/en/translation.json`

## UI Contract

### Routes

- `/d/admin/plans`
- `/d/admin/plans/new`
- `/d/admin/plans/:planId`

### List Page

- table or list of plans
- enabled/default badges
- sort order
- channel count
- create action

### Form Page

- create and edit modes
- channel multi-select
- enabled/default toggles
- validation errors
- delete action on edit mode

## Permissions

- Admin only
- Backend remains the source of truth for uniqueness and default-plan rules

## Acceptance Criteria

1. Admin can list plans.
2. Admin can create a new plan.
3. Admin can edit an existing plan.
4. Admin can delete a plan that is not currently assigned to users.
5. Duplicate slugs are rejected cleanly.
6. Only one plan can be marked as default.

## Testing Scope

### Backend

- list success
- create success
- update success
- duplicate slug failure
- default-plan uniqueness behavior
- delete blocked when plan is assigned

### Frontend

- list render
- create form validation
- edit form load
- mutation success and error states

## Cut Line

This slice is done when `AdminPlan` can be managed end to end. Do not add user assignment or runtime restriction here.
