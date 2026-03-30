# Phase 7 Slice 1: Role Domain And Seeding

## Goal

Turn the existing `Role` collection into an explicitly managed role catalog with immutable metadata for reserved roles.

## Out Of Scope

- no admin UI yet
- no user assignment UI yet
- no new permission model

## Current Findings

- `packages/data-provider/src/roles.ts` defines `SystemRoles.ADMIN` and `SystemRoles.USER`
- `packages/data-schemas/src/methods/role.ts` only initializes those two roles
- `api/models/Role.js` lazily creates a role from `roleDefaults` only when the name matches `SystemRoles`

## Proposed Data Shape

Add metadata to the `Role` schema:

- `description?: string`
- `isSystem: boolean`
- `isEditable: boolean`
- `isDeletable: boolean`

Seed rules:

- `ADMIN`
  - `isSystem = true`
  - `isEditable = true` only for permissions, not for name
  - `isDeletable = false`
- `USER`
  - `isSystem = true`
  - `isEditable = true`
  - `isDeletable = false` in the first pass to preserve a safe fallback role

## Backend Rules

- keep `SystemRoles.ADMIN` as the reserved bypass role
- keep `SystemRoles.USER` as the fallback role for legacy flows and new-user defaults in the first pass
- initialize system roles if missing
- when existing role docs lack the new metadata, backfill them

## Expected File Touches

- `packages/data-schemas/src/schema/role.ts`
- `packages/data-schemas/src/types/*` for role interfaces if needed
- `packages/data-schemas/src/methods/role.ts`
- `api/models/Role.js`
- tests under `api/models/Role.spec.js` and data-schemas role tests

## Acceptance Criteria

- `ADMIN` and `USER` are present after seed
- seeded `ADMIN` cannot be marked deletable
- existing deployments get metadata backfilled without data loss
- `getRoleByName('ADMIN')` still works for middleware and auth

## Cut Line

Stop after the role domain and seed path are safe for custom roles. Do not add list/create/update/delete routes in this slice.
