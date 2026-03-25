# Slice Spec: Admin User Detail

## Goal

Add an admin-only user detail page for inspecting one account.

This slice remains read-only. It provides the inspection view needed before adding write actions such as balance changes or plan assignment.

## Out Of Scope

- Editing role
- Editing profile fields
- Assigning plans
- Adjusting balances
- Banning or unbanning users
- Showing usage charts

## User Story

An admin can open a user detail page from the users list and inspect the account's current identity and account-state fields.

## Backend API Contract

### Endpoint

`GET /api/admin/users/:userId`

### Behavior

- Requires authenticated admin.
- Returns one user record by Mongo user id.
- Should return a safe admin view, not raw secret fields.

### Response Shape

```json
{
  "id": "string",
  "name": "string|null",
  "username": "string|null",
  "email": "string",
  "role": "ADMIN|USER",
  "provider": "string",
  "emailVerified": true,
  "twoFactorEnabled": false,
  "termsAccepted": true,
  "createdAt": "2026-03-25T00:00:00.000Z",
  "updatedAt": "2026-03-25T00:00:00.000Z",
  "favoritesCount": 2,
  "plugins": ["string"],
  "personalization": {
    "memories": true
  }
}
```

### Error Cases

- `401` unauthenticated
- `403` non-admin
- `404` user not found

## Data Source

Use the existing `User` collection only.

No schema changes in this slice.

## Proposed Implementation Files

### Backend

- `packages/api/src/admin/users.ts`
- `api/server/routes/admin/users.js`

### Shared Client Data Layer

- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/types/queries.ts`

### Frontend

- `client/src/data-provider/Admin/queries.ts`
- `client/src/components/Admin/Users/AdminUserDetail.tsx`
- `client/src/components/Admin/Users/AdminUsersPage.tsx`
- `client/src/routes/Dashboard.tsx`
- `client/src/locales/en/translation.json`

## UI Contract

### Route

`/d/admin/users/:userId`

### Page Structure

- Back link to users list
- Identity panel
- Account state panel
- Security panel
- Optional placeholders for future actions

### Suggested Sections

- Basic identity
- Authentication and verification
- Personalization and plugin settings
- Timestamps

## Permissions

- Same as Slice 1
- Backend must remain the source of truth

## Acceptance Criteria

1. Admin can open a user detail page from the users list.
2. Unknown `userId` returns `404` and the UI shows a stable not-found state.
3. Sensitive fields such as password hashes, TOTP secrets, refresh tokens, and backup codes are never returned.
4. Non-admin access to the API returns `403`.

## Testing Scope

### Backend

- success case
- `404` case
- ensure protected fields are omitted

### Frontend

- detail page render
- not-found state render
- navigation from list to detail

## Cut Line

This slice is done when the admin can inspect one account safely. Do not add mutation buttons in this slice.
