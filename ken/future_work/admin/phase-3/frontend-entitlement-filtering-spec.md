# Phase 3 Slice 4: Frontend Entitlement Filtering

## Goal

Use the authenticated entitlement payload to hide or avoid invalid endpoint/model choices in the existing chat UI.

## Out Of Scope

- no replacement chat selector
- no admin console changes
- no backend enforcement changes
- no balance UI

## UX Contract

Frontend filtering is a convenience layer only.

Required behavior:

- if the user is unrestricted, UI behavior stays unchanged
- if the user is restricted, endpoint/model selectors only show allowed pairs where practical
- if the current conversation points to a blocked pair, new requests still rely on backend enforcement if the UI cannot fully repair the state

## Suggested Integration Points

Model and endpoint sources currently flow through:

- `client/src/hooks/Endpoint/useEndpoints.ts`
- `client/src/components/Input/ModelSelect/ModelSelect.tsx`
- `client/src/hooks/useNewConvo.ts`

These are the preferred first-pass integration points because they already shape visible endpoint and model choices.

## Files Expected To Change

- `packages/data-provider/src/types/queries.ts`
- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `client/src/data-provider/Admin/queries.ts` or another user-facing query module
- `client/src/hooks/Endpoint/useEndpoints.ts`
- `client/src/components/Input/ModelSelect/ModelSelect.tsx`
- `client/src/hooks/useNewConvo.ts`
- `client/src/locales/en/translation.json` only if new user-facing states are needed

## Behavior Rules

- do not invent synthetic models or channels in the selector
- only filter when `isRestricted === true`
- for a restricted user starting a new conversation, choose the first allowed visible pair if the current default pair is blocked
- if a stale existing conversation still points to a blocked pair, prefer a clear disabled or fallback state over mutating historical conversation records

## Acceptance Criteria

- restricted users do not see obviously blocked endpoints in the endpoint list
- restricted users do not see blocked models in the model selector for the chosen endpoint
- unrestricted users see the same choices as before
- new conversation defaults do not select a blocked pair for a restricted user
- stale conversations do not crash the UI

## Test Scope

- render tests for endpoint and model selector behavior
- focused hook tests for default conversation selection if the repo already has that pattern
- avoid broad snapshot tests

## Cut Line

This slice is done when the common chat UI avoids presenting blocked choices, even though backend enforcement remains the real gate.
