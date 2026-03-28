# Phase 6 Slice 5: Plan To Model Entitlements Migration

## Goal

Move plans from transitional `channelIds` toward model-level entitlement.

## Out Of Scope

- no quota engine rewrite
- no usage-ledger redesign

## Product Rule

The end state is:

- plans define allowed models
- channels remain the runtime/provider container
- channels are not the final authorization unit

Example target behavior:

- a plan may allow the weakest model from every enabled channel

## Transitional Rule

During migration, `plan -> channel` may continue to exist, but only as a compatibility layer.

The design should support:

- channel-derived model sets for old plans
- direct model entitlements for new plans
- a clean migration path for existing user assignments

## Required Work

- define model entitlement schema
- extend entitlement resolution to read model-level plan rules
- keep backend enforcement deterministic
- update frontend filtering to use model-level entitlements

## Files Expected To Change

- `packages/data-schemas/src/schema/adminPlan.ts`
- `packages/api/src/admin/access.ts`
- `api/server/middleware/validateModel.js`
- `packages/api/src/agents/validation.ts`
- `client/src/hooks/Endpoint/entitlements.ts`
- plan admin UI

## Acceptance Criteria

- plans can express allowed models directly
- backend enforcement no longer depends on channel membership alone
- frontend filtering remains aligned with backend enforcement
- existing plans can be migrated incrementally

## Cut Line

This slice is done when the system can support model-level plan restriction without removing compatibility for existing channel-based plans immediately.
