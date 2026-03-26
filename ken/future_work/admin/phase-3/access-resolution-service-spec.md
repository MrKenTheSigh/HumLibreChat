# Phase 3 Slice 1: Access Resolution Service

## Goal

Add one shared service that resolves the current user's effective plan and allowed `endpoint + model` pairs.

This slice creates the source of truth for every later Phase 3 step.

## Out Of Scope

- no route wiring yet
- no frontend changes
- no balance mutation
- no reporting

## Internal Contract

Create `packages/api/src/admin/access.ts` with a narrow resolver API.

Suggested shape:

```ts
type ResolvedEntitlements = {
  userId: string;
  scope: 'admin_bypass' | 'assigned_plan' | 'default_plan' | 'unrestricted' | 'invalid_plan';
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
  isRestricted: boolean;
};

resolveUserEntitlements(params: {
  userId: string;
  role?: string | null;
}): Promise<ResolvedEntitlements>;
```

## Data Sources

- `User`
  - `adminPlanId`
  - `role`
- `AdminPlan`
- `AdminChannel`

## Policy Rules

- `SystemRoles.ADMIN` returns `scope = 'admin_bypass'` and `isRestricted = false`
- enabled assigned plan wins
- no assigned plan + one enabled default plan uses that default plan
- no assigned plan + no default plan returns `scope = 'unrestricted'`
- assigned plan missing or disabled returns `scope = 'invalid_plan'`, `isRestricted = true`, and no allowed pairs
- disabled channels and disabled channel entries do not contribute allowed pairs

## Files Expected To Change

- `packages/api/src/admin/access.ts`
- `packages/api/src/admin/access.spec.ts`
- `packages/api/src/admin/index.ts`

## Acceptance Criteria

- admin user resolves to unrestricted bypass
- user with assigned enabled plan resolves to only that plan's enabled entries
- user with no assigned plan and one default plan resolves to that default plan
- user with no plan and no default plan resolves to unrestricted
- user with invalid assigned plan resolves to restricted with zero allowed pairs
- duplicate `endpoint + model` pairs are deduplicated in the resolved result

## Test Scope

- service tests only
- use real schema mapping logic where practical
- cover all five scope outcomes

## Cut Line

This slice is done when the resolver is deterministic and fully tested, even if no runtime route or middleware uses it yet.
