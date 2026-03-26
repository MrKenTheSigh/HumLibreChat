# Admin Backoffice Phase 2 Slice Index

This file breaks Phase 2 into small implementation slices that can be built independently.

## Phase Description

Phase 2 adds the business control layer that HumLibreChat does not currently have: admin-managed plans and admin-managed channels.

This phase must preserve the current HumLibreChat architecture:

- keep the existing endpoint and model initialization flow
- keep `librechat.yaml` as the source of provider setup
- model channels as an overlay over already-supported `endpoint + model` combinations
- avoid chat runtime enforcement in this phase

## Slice Order

1. `admin-channel-inventory-spec.md`
2. `admin-plans-crud-spec.md`
3. `admin-channels-crud-spec.md`
4. `admin-user-plan-assignment-spec.md`

## Guardrails

- Do not let Phase 2 create or manage provider secrets.
- Do not allow admin channels to invent models that HumLibreChat does not already expose.
- Do not add runtime chat enforcement in Phase 2.
- Keep backend implementation in `packages/api`; keep `/api` wrappers thin.
- Prefer extending the existing `User` schema for plan assignment instead of creating a second user-profile collection.

## Expected Dependency Flow

- Slice 1 should land first because channel CRUD depends on a trusted inventory source.
- Slice 2 and Slice 3 can proceed in parallel after Slice 1, as long as their write scopes stay separate.
- Slice 4 depends on Slice 2 because it assigns an existing plan to a user.
- UI route wiring for plans and channels should stay close to the slices that own those screens rather than being treated as a separate phase.

## Review Standard

Each slice should be approved only if all of the following are true:

- scope is narrow and stable
- the API contract is explicit enough to implement without inventing business rules mid-flight
- the slice preserves HumLibreChat's endpoint/model architecture
- acceptance criteria can be verified in one pass
- no slice quietly requires chat-runtime enforcement to feel complete

## Exit Condition

This phase is complete when an admin can:

- inspect the valid endpoint/model inventory exposed by the current app config
- create, edit, list, and delete plans
- create, edit, list, and delete channels that reference only valid inventory entries
- assign a plan to a user from the admin area

Runtime restriction of chat requests by plan is explicitly deferred to Phase 3.
