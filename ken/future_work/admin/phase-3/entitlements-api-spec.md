# Phase 3 Slice 3: User Entitlements API

## Goal

Expose the current authenticated user's resolved entitlements so the frontend can avoid showing obviously unavailable choices.

## Out Of Scope

- no admin-only API here
- no balance values
- no plan mutation
- no reporting

## API Contract

Route:

- `GET /api/user/entitlements`

Auth:

- authenticated user only

Response:

```ts
type UserEntitlementsResponse = {
  scope: 'admin_bypass' | 'assigned_plan' | 'default_plan' | 'unrestricted' | 'invalid_plan';
  isRestricted: boolean;
  plan: {
    id: string;
    name: string;
    slug: string;
  } | null;
  allowedChannels: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  allowedPairs: Array<{
    endpoint: string;
    model: string;
    channelId: string;
    channelSlug: string;
  }>;
};
```

## Files Expected To Change

- `packages/api/src/admin/access.ts`
- `packages/api/src/admin/index.ts`
- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/types/queries.ts`
- `client/src/data-provider/Admin/queries.ts` or another user-facing query module if preferred
- `api/server/routes/user.js`
- one thin JS wrapper or controller export in `/api` if needed

## Behavior Rules

- response reuses the Slice 1 resolver result
- admin users may see unrestricted entitlements, but the route must still be user-scoped
- no data about other users should leak here
- if the assigned plan is invalid, the response should still succeed with `scope = 'invalid_plan'`

## Acceptance Criteria

- authenticated user receives a stable entitlement payload
- unauthenticated request gets `401`
- payload matches Slice 1 policy outcomes
- client query key and data service are available for frontend use

## Test Scope

- backend handler tests
- route auth tests
- shared data-provider query/service tests only if the repo already covers that layer

## Cut Line

This slice is done when the frontend can query entitlements without guessing plan resolution logic locally.
