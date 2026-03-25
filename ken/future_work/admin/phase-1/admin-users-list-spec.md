# Slice Spec: Admin Users List

## Goal

Add an admin-only users list page with search and basic filters.

This slice is read-only. It establishes the first admin area, the first admin data-provider hooks, and the first reusable admin page layout.

## Out Of Scope

- Editing users
- Assigning plans
- Adjusting balances
- Banning or unbanning users
- Showing full user detail beyond list columns
- Creating a new admin role system

## User Story

An admin can open an admin page and browse all user accounts in the system, search by identity fields, and filter by a small set of common account attributes.

## Backend API Contract

### Endpoint

`GET /api/admin/users`

### Query Params

- `cursor`
- `limit`
- `search`
- `role`
- `provider`
- `emailVerified`

### Behavior

- Requires authenticated admin.
- Returns cursor-paginated results.
- `search` should match `email`, `username`, and `name`.
- Default sort should be newest first by `createdAt`.

### Response Shape

```json
{
  "users": [
    {
      "id": "string",
      "name": "string|null",
      "username": "string|null",
      "email": "string",
      "role": "ADMIN|USER",
      "provider": "string",
      "emailVerified": true,
      "twoFactorEnabled": false,
      "createdAt": "2026-03-25T00:00:00.000Z",
      "updatedAt": "2026-03-25T00:00:00.000Z"
    }
  ],
  "nextCursor": "string|null"
}
```

### Error Cases

- `401` unauthenticated
- `403` authenticated but not admin
- `400` invalid query params
- `500` unexpected failure

## Data Source

Use the existing `User` collection only.

No schema changes in this slice.

## Proposed Implementation Files

### Backend

- `packages/api/src/admin/users.ts`
- `packages/api/src/admin/index.ts`
- `api/server/routes/admin/users.js`
- `api/server/routes/index.js`
- `api/server/index.js`

### Shared Client Data Layer

- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/types/queries.ts`

### Frontend

- `client/src/data-provider/Admin/queries.ts`
- `client/src/data-provider/Admin/index.ts`
- `client/src/components/Admin/AdminLayout.tsx`
- `client/src/components/Admin/AdminView.tsx`
- `client/src/components/Admin/Users/AdminUsersPage.tsx`
- `client/src/routes/Dashboard.tsx`
- `client/src/locales/en/translation.json`

## UI Contract

### Route

`/d/admin/users`

### Page Structure

- Admin section shell
- Search input
- Filter controls
  - role
  - provider
  - email verified
- Table view
- Empty state
- Pagination or load-more control

### Suggested Columns

- name
- username
- email
- role
- provider
- email verified
- 2FA enabled
- created at

## Permissions

### Frontend

- Hide admin nav entry unless current user is `ADMIN`.
- If a non-admin somehow reaches the route, redirect away or render nothing after auth state resolves.

### Backend

- Always enforce `requireAdmin`.

## Acceptance Criteria

1. An admin can load `/d/admin/users` and see a paginated list of users.
2. Search filters results by `email`, `username`, or `name`.
3. Role and provider filters work independently and together.
4. A non-admin request to `GET /api/admin/users` returns `403`.
5. Empty results render a stable empty state instead of a broken table.

## Testing Scope

### Backend

- route test for `401`
- route test for `403`
- route test for default success
- route test for search/filter combinations

### Frontend

- render test for table state
- render test for empty state
- route guard test for non-admin path access

## Cut Line

This slice is done when the admin can list users. Do not add clickable user detail behavior in this slice unless it is a simple route link with no detail page implementation behind it.
