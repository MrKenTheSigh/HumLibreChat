# Phase 7 Slice 4: Admin User Role Assignment

## Goal

Let admins inspect and change a user's role from the admin users area.

## Out Of Scope

- no bulk assignment
- no ban workflow changes
- no SSO group-to-role mapping redesign

## API Contract

### `POST /api/admin/users/:userId/role`

Input:

- `roleName`

Rules:

- target role must exist
- `ADMIN` may be assigned
- role change should update the stored `user.role`

### `DELETE /api/admin/users/:userId/role`

Not recommended in the first pass.

Safer first-pass rule:

- instead of delete, reassign to fallback `USER`

## UI Placement

Add a role card in admin user detail:

- current role
- available role select
- save action

## Special Rules

- at least one `ADMIN` must remain in the system
- reject self-demotion if it would leave zero admins
- reject deleting a role while it is still assigned to users

## Expected File Touches

- `packages/api/src/admin/users.ts`
- admin user route wrapper in `/api`
- `client/src/components/Admin/Users/AdminUserDetail.tsx`
- a new role assignment card component

## Acceptance Criteria

- admin can assign a custom role to a user
- assigned user immediately sees the correct permissions after refresh/login
- the last remaining `ADMIN` cannot be removed or demoted accidentally

## Cut Line

Stop after single-user assignment is safe and validated. Bulk operations can wait.
