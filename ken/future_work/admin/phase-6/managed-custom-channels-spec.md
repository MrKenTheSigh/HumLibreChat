# Phase 6 Slice 3: Managed Custom Channels

## Goal

Implement managed runtime channels for `custom` / OpenAI-compatible providers first.

## Out Of Scope

- no Azure-native channel support in this slice
- no final plan-to-model migration

## Why This Slice First

`custom` endpoints already align well with the current runtime design:

- they are config-driven
- they already support model lists
- they already support token config overrides

## Required Behavior

An admin can create a custom channel with:

- base URL
- API key or secret reference
- enabled models
- optional model fetch
- optional pricing override

That channel should become usable by the runtime after config cache refresh.

## Pricing Rule

Model pricing override should map into `endpointTokenConfig` semantics, not invent a new token accounting path.

## Files Expected To Change

- `packages/api/src/endpoints/custom/`
- `packages/api/src/admin/`
- `client/src/components/Admin/Channels/`
- `packages/data-schemas/`
- `packages/data-provider/`

## Acceptance Criteria

- admin can create and edit custom runtime channels
- custom channels can supply enabled models to runtime
- pricing overrides affect transaction accounting through existing paths
- usage reporting can expose the resulting rate data

## Cut Line

This slice is done when one OpenAI-compatible provider can be fully managed from the admin UI without hand-editing YAML/env.
