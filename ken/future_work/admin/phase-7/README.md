# Admin Backoffice Phase 7

## Phase Description

Phase 7 introduces admin-managed custom roles and replaces the remaining hard-coded `ADMIN` / `USER` assumptions with dynamic role loading.

This phase keeps the existing permission matrix model. It does not introduce a second role engine.

## Product Goal

An admin should be able to:

- list all roles
- create a new role from the existing permission model
- edit a role's name, description, and permissions
- assign a role to a user from the admin users area
- keep one built-in `ADMIN` role that cannot be deleted

## Scope Boundary

This phase is about system user roles, not resource ACL roles.

It covers:

- the `Role` collection used by `user.role`
- admin CRUD for those roles
- dynamic role loading in the auth context and permission checks
- admin user role assignment

It does not cover:

- `AccessRole` for prompts, agents, or other shared resources
- a new organization/team hierarchy
- per-plan role assignment
- UI polish beyond the minimum needed to manage roles safely

## Current System Constraints

The current role model is only partially dynamic.

What is already dynamic:

- permission checks generally call `getRoleByName(user.role)`
- the `Role` collection already stores a permissions object

What is still hard-coded:

- default role seeding only initializes `ADMIN` and `USER`
- the auth context only fetches `ADMIN` and `USER`
- admin settings dialogs only switch between `ADMIN` and `USER`
- admin create-user only offers `ADMIN` and `USER`
- some login strategies demote missing/removed admins back to `USER`
- several UI components use `SystemRoles.ADMIN` directly as the only bypass role

## Target End State

### Managed Role Catalog

Roles become editable admin-managed entities with metadata:

- `name`
- `description`
- `permissions`
- `isSystem`
- `isEditable`
- `isDeletable`

### Immutable Admin

`ADMIN` remains a reserved role with these guarantees:

- it always exists
- it cannot be deleted
- it cannot be renamed
- its broad access bypass behavior remains intact

### Dynamic Role Loading

The client should stop assuming there are only two roles.

Instead:

- auth bootstrap loads the current user's role plus a role catalog
- permission hooks resolve from the loaded role map
- admin settings dialogs read available roles from the server

### User Assignment

Users should be assignable to any available role from the admin users area.

## Recommended Slice Order

1. `role-domain-and-seeding-spec.md`
2. `admin-roles-api-spec.md`
3. `auth-and-client-role-loading-spec.md`
4. `admin-user-role-assignment-spec.md`

## Exit Condition

This phase is complete when:

- an admin can CRUD custom roles
- the built-in `ADMIN` role cannot be deleted
- users can be assigned to those roles
- permission checks and admin settings use dynamically loaded roles instead of the fixed `ADMIN` / `USER` pair

## Current Status

- Slice 1 is complete.
- Slice 2 is complete.
- Slice 3 is in progress.
- Slice 4 is in progress.
- right-side control panel visibility for `Parameters`, `Attach files`, `Agents`, and `MCP Servers` is now role-managed
- for `Agents` and `MCP Servers`, phase 7 currently only controls whether the control panel item is visible
- deeper panel availability rules such as builder enablement, available MCP server state, and empty-state UX are deferred
- `Role` now has managed metadata for:
  - `description`
  - `isSystem`
  - `isEditable`
  - `isDeletable`
- system role seeding now backfills and enforces metadata for `ADMIN` and `USER`
- `ADMIN` remains non-deletable at the data-model level
- admin roles API now supports list, get, create, update, and delete
- admin users can be created with any existing role and reassigned later
- the auth context now loads the signed-in user's actual role instead of only `USER` / `ADMIN`
- admin settings dialogs now read the dynamic role catalog instead of a fixed pair
- interface permission sync now includes custom roles and seeds them from the `USER` template when no system default exists

## Future Verification Work

Phase 7 still needs a broader verification pass for role-managed permissions.

This should go beyond checking whether a control panel item is visible and should verify:

- route-level access for each role-managed feature
- page-level rendering and empty states
- chat input controls and tool toggles
- side panel item visibility versus the actual panel behavior
- backend enforcement for features that also have API gates
- restart persistence so admin-edited role permissions survive backend reloads
- precedence rules to ensure admin-managed role settings continue to win over `.env` and `librechat.yaml`

Priority areas to re-verify:

- `CHAT`
- `PARAMETERS`
- `FILE_UPLOADS`
- `PROMPTS`
- `AGENTS`
- `MEMORIES`
- `BOOKMARKS`
- `MULTI_CONVO`
- `TEMPORARY_CHAT`
- `RUN_CODE`
- `WEB_SEARCH`
- `FILE_SEARCH`
- `FILE_CITATIONS`
- `MCP_SERVERS`
- `REMOTE_AGENTS`
- `MARKETPLACE`
