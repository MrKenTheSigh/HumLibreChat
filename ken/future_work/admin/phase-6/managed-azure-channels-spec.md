# Phase 6 Slice 4: Managed Azure Channels

## Goal

Implement managed runtime channels for `azureOpenAI`.

## Out Of Scope

- no support for every possible provider in one pass
- no final plan-to-model UI in this slice

## Azure-Specific Constraints

Azure currently depends on:

- group-based config normalization
- deployment mapping
- model-to-group resolution

That means the managed channel design must be convertible into the same Azure runtime structures already used by HumLibreChat.

## Required Behavior

An admin can define Azure-backed channels with:

- resource / instance mapping
- API version
- API key or secret reference
- deployments per model
- enabled models
- optional pricing override

## Important Rule

Do not create a second Azure runtime path if avoidable.

Prefer transforming managed Azure channel data into the same effective Azure config shape already consumed by runtime initialization.

## Files Expected To Change

- `packages/data-schemas/src/app/azure.ts`
- `packages/api/src/endpoints/openai/initialize.ts`
- `packages/api/src/admin/`
- `client/src/components/Admin/Channels/`
- config merge layer from slice 2

## Acceptance Criteria

- Azure channels can be created and edited from admin UI
- Azure runtime can resolve deployments from managed config
- model availability updates without editing YAML/env
- pricing overrides are compatible with HumLibreChat token accounting

## Cut Line

This slice is done when Azure becomes a first-class managed runtime channel, even if some legacy env fallback remains available.
