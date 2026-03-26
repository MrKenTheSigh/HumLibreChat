# Admin Backoffice Phase 3 Slice Index

This file breaks Phase 3 into small implementation slices that can be built and verified independently.

## Phase Description

Phase 3 connects the existing `AdminPlan` and `AdminChannel` data to actual runtime access rules.

This is the first phase that touches a core request path, so the design must stay narrow:

- preserve the current HumLibreChat endpoint initialization flow
- keep balance policy out of this phase
- make backend enforcement the source of truth
- treat frontend filtering as a UX improvement, not a security boundary

## Readiness Assessment

Phase 3 is complete.

Required prerequisites are already present:

- `AdminPlan` schema and CRUD
- `AdminChannel` schema and CRUD
- channel inventory validation
- user plan assignment
- existing model validation middleware and agent validation helpers that can be extended

Not required before Phase 3:

- automatic plan-based credit provisioning
- usage dashboard work
- a new provider or channel architecture

## Delivery Summary

The phase now has all four planned slices wired into the product:

- shared entitlement resolution for assigned plan, default plan, unrestricted, invalid plan, and admin bypass
- backend enforcement in the model validation path and agent validation path
- authenticated `GET /api/user/entitlements`
- frontend filtering for visible endpoints, models, model specs, and default selection fallbacks

Additional frontend cleanup also landed so unrestricted and admin users no longer see empty endpoints that have no usable models.

## Slice Order

1. `access-resolution-service-spec.md`
2. `backend-chat-enforcement-spec.md`
3. `entitlements-api-spec.md`
4. `frontend-entitlement-filtering-spec.md`

## Guardrails

- Do not replace `validateModel` with a new route tree.
- Do not redesign `buildEndpointOption` or endpoint initialization.
- Do not let plan enforcement mutate balances.
- Do not try to govern every assistant or agent edge case in the first slice.
- Prefer fail-open only when the user has no assigned/default plan. For broken assigned plans, fail with a clear restriction result.

## Default Policy Decisions

These rules should be treated as fixed unless a later review explicitly changes them:

- `SystemRoles.ADMIN` bypasses plan restrictions.
- If a user has an enabled assigned plan, enforce that plan.
- If a user has no assigned plan and there is one enabled default plan, enforce the default plan.
- If a user has no assigned plan and no default plan exists, remain unrestricted for backward compatibility.
- If a user points at a missing or disabled assigned plan, treat the user as restricted with no allowed pairs and surface the mismatch clearly.

## Expected Dependency Flow

- Slice 1 lands first because every other slice needs a single entitlement resolver.
- Slice 2 depends on Slice 1 and should wire the smallest viable runtime choke point first.
- Slice 3 depends on Slice 1 and can proceed in parallel with late-stage Slice 2 testing.
- Slice 4 depends on Slice 3 because the frontend needs a stable entitlement payload.

## Review Standard

Each slice should be approved only if all of the following are true:

- the runtime hook point is explicit and minimal
- access behavior is deterministic for assigned plan, default plan, and no-plan users
- the slice does not introduce plan-based balance mutation
- API and response shapes are concrete enough to implement without re-deciding policy
- acceptance criteria can be verified with targeted tests rather than broad manual QA only

## Exit Condition

This phase is complete when:

- blocked users cannot invoke disallowed `endpoint + model` pairs
- allowed users can still invoke their permitted models
- users can fetch a lightweight entitlement view from the authenticated API
- the frontend can avoid showing obviously unavailable choices for the current user

All exit conditions above are now satisfied.
