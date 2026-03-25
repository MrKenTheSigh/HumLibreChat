# Admin Backoffice Phase 1 Slice Index

This file breaks Phase 1 into small implementation slices that can be built independently.

## Phase Description

Phase 1 delivers the first usable admin backoffice with the lowest architectural risk. It is intentionally limited to existing data sources and avoids changes to the chat execution path.

## Slice Order

1. `admin-users-list-spec.md`
2. `admin-user-detail-spec.md`
3. `admin-balance-actions-spec.md`
4. `admin-conversations-audit-spec.md`

## Guardrails

- Do not change chat generation flow in Phase 1.
- Do not add new Mongo collections in Phase 1.
- Do not change the existing YAML endpoint/model architecture in Phase 1.
- Keep backend enforcement on `SystemRoles.ADMIN` only.
- Prefer `packages/api` for new backend logic and keep `/api` as thin wrappers.

## Expected Dependency Flow

- Slice 1 should land first because Slice 2 and Slice 3 both depend on the same admin user query and page shell patterns.
- Slice 2 can land before or after Slice 3.
- Slice 4 is independent from Slice 3 and can run in parallel after Slice 1 patterns are established.

## Review Standard

Each slice should be approved only if all of the following are true:

- Scope is narrow and stable.
- The API contract is explicit enough to implement without inventing behavior mid-flight.
- The file touch list is plausible and not spread across unrelated areas.
- Acceptance criteria can be tested in one pass.
- The slice does not force a second hidden slice to be completed first.
