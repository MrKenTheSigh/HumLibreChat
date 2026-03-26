# Phase 3 Slice 2: Backend Chat Enforcement

## Goal

Enforce plan restrictions on the smallest viable runtime path so blocked `endpoint + model` selections are rejected before generation begins.

## Out Of Scope

- no frontend filtering
- no balance policy
- no broad endpoint refactor
- no attempt to govern every assistant or agent graph edge case in the same slice

## Enforcement Contract

When a restricted user submits a blocked `endpoint + model` pair:

- return `403`
- return a stable error payload with a clear message
- do not start model initialization

Suggested payload:

```json
{
  "message": "Model is not allowed for the current plan",
  "error_code": "PLAN_MODEL_FORBIDDEN"
}
```

## Hook Point

Start from the existing model validation path instead of building a second request pipeline.

Primary target:

- `api/server/middleware/validateModel.js`

Secondary parity target for agent validation:

- `packages/api/src/agents/validation.ts`

The resolver from Slice 1 should be called from the smallest shared choke point available before model execution.

## Files Expected To Change

- `packages/api/src/admin/access.ts`
- `packages/api/src/admin/access.spec.ts`
- `api/server/middleware/validateModel.js`
- `api/server/middleware/__tests__/validateModel*.spec.js` or nearest existing route-level tests
- `packages/api/src/agents/validation.ts`
- `packages/api/src/agents/validation.spec.ts`

## Policy Rules

- unrestricted users continue on the existing path
- restricted users may only use resolved allowed pairs
- `invalid_plan` users are denied
- do not mutate the request to force a fallback model in this slice
- backend remains authoritative even if the frontend still shows stale choices

## Acceptance Criteria

- restricted user can call an allowed pair successfully
- restricted user gets `403` for a blocked pair
- unrestricted user behavior is unchanged
- invalid assigned plan produces deterministic denial
- agent validation does not silently bypass the same restriction rules

## Test Scope

- targeted middleware tests
- route-level tests where a blocked model is rejected
- agent validation tests for parity on the shared rule set

## Cut Line

This slice is done when runtime enforcement works on the chosen choke point and the backend is trustworthy even without frontend filtering.
