# Phase 7 Slice 3: Auth And Client Role Loading

## Goal

Replace the client-side assumption that only `ADMIN` and `USER` exist.

## Out Of Scope

- no full role management screen yet
- no UI redesign for existing admin settings dialogs

## Current Findings

- `client/src/hooks/AuthContext.tsx` only fetches `USER` and conditionally `ADMIN`
- `client/src/components/ui/AdminSettingsDialog.tsx` only allows selecting `USER` or `ADMIN`
- `client/src/components/Sharing/PeoplePickerAdminSettings.tsx` does the same
- `useHasAccess` already supports `roles[user.role]`, so the missing piece is role catalog loading

## Proposed Changes

### Auth bootstrap

Add a role catalog query:

- fetch all roles for admins
- fetch the current user's role at minimum for non-admins

Return a dynamic `roles` map keyed by role name.

### Admin settings dialogs

Change role dropdown data source from fixed `SystemRoles.USER/ADMIN` to the fetched role list.

Behavior:

- still gate the dialog itself behind `user.role === ADMIN`
- allow editing permissions for custom roles

### Create user form

Replace the hard-coded role select with dynamic role options.

## Expected File Touches

- `client/src/hooks/AuthContext.tsx`
- `client/src/common/types.ts`
- `client/src/components/ui/AdminSettingsDialog.tsx`
- `client/src/components/Sharing/PeoplePickerAdminSettings.tsx`
- `client/src/components/Admin/Users/AdminCreateUserCard.tsx`
- role queries/mutations in `client/src/data-provider` and `packages/data-provider`

## Acceptance Criteria

- a custom role appears in the admin settings role dropdowns
- create-user form can assign a custom role
- `useHasAccess` works for a user whose `role` is not `USER` or `ADMIN`

## Cut Line

Stop when the client can load and use dynamic roles safely. A dedicated `Admin Roles` page is still a later slice.
