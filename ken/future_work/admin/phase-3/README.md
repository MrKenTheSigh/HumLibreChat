# Admin Backoffice Phase 3

## Phase Description

Phase 3 connects the plan and channel data model to actual chat access rules.

This is the first phase that touches a core runtime path, so the implementation should stay narrow and avoid broader endpoint refactors.

## Planned Outcomes

- resolve the current user's plan
- resolve allowed channels and allowed `endpoint + model` pairs
- reject blocked model selections on the backend
- expose a lightweight entitlement view for the frontend
- hide unavailable choices in the existing UI where practical

## Implementation Direction

- add one shared access service in `packages/api/src/admin/access.ts`
- call that service from the smallest viable existing request choke point
- keep frontend filtering secondary to backend enforcement

## Exit Condition

This phase is complete when:

- blocked users cannot invoke disallowed models
- allowed users can still use their permitted models
- the frontend can avoid showing obviously unavailable choices for the current user
