# Phase 6 Slice 2: Runtime Config Merge

## Goal

Feed database-managed channel/provider config into HumLibreChat's existing runtime config path.

## Out Of Scope

- no direct file editing of `.env` or `librechat.yaml`
- no frontend CRUD polish
- no model-level plan migration yet

## Design Rule

Do not replace endpoint initialization.

Instead:

- load bootstrap config from YAML/env
- load managed channel config from DB
- merge into effective config before runtime endpoint/model initialization

## Primary Integration Seam

Prefer extending the config loading path before or within `AppService` input handling.

That keeps these paths mostly reusable:

- endpoint config loading
- model config loading
- provider initialization
- token accounting

## Required Behavior

- admin-managed channels can affect effective endpoint/model availability
- cache invalidation is explicit after admin config changes
- runtime rebuild does not require hand-editing config files

## Cache Work

At minimum, admin config changes must invalidate:

- app config cache
- endpoint config cache
- models config cache

## Files Expected To Change

- `api/server/services/Config/app.js`
- `api/server/services/Config/getEndpointsConfig.js`
- `api/server/controllers/ModelController.js`
- `packages/api/src/app/`
- `packages/api/src/admin/`

## Acceptance Criteria

- DB-managed config can appear in effective runtime config
- runtime endpoint/model inventory updates after admin changes
- cache invalidation behavior is deterministic
- no direct file mutation is required

## Cut Line

This slice is done when managed channels can influence runtime availability through config merging, even if only one provider type is supported first.
