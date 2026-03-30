# Phase 7 Slice 2: Admin Roles API

## Goal

Add admin-only APIs to list, create, update, and delete system user roles.

## Out Of Scope

- no frontend role management page yet
- no user assignment yet
- no migration of all existing admin permission dialogs yet

## API Contract

### `GET /api/admin/roles`

Returns:

- role list
- metadata flags
- permissions

### `GET /api/admin/roles/:roleName`

Returns one role.

### `POST /api/admin/roles`

Creates a custom role.

Input:

- `name`
- `description`
- `permissions`

Rules:

- uppercase canonical storage is recommended for consistency with current role usage
- name must be unique
- cannot create a duplicate `ADMIN`

### `PATCH /api/admin/roles/:roleName`

Updates:

- `description`
- `permissions`
- optional rename only for non-system roles

Rules:

- `ADMIN` cannot be renamed
- `ADMIN` remains non-deletable

### `DELETE /api/admin/roles/:roleName`

Rules:

- reject delete for `ADMIN`
- reject delete for `USER` in the first pass
- reject delete when any user still references the role

## Expected File Touches

- `packages/api/src/admin/roles.ts`
- thin wrapper under `api/server/routes/admin/roles.js`
- `api/server/index.js` or route index
- shared endpoints/types in `packages/data-provider`

## Acceptance Criteria

- admin can list all roles
- admin can create a new custom role
- admin can edit a custom role
- admin cannot delete `ADMIN`
- admin cannot delete a role in active use

## Cut Line

Stop at stable backend CRUD and shared client data layer. Do not build the UI in this slice.
