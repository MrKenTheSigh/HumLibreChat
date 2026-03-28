# Phase 6 Slice 1: Managed Channel Domain

## Goal

Define the new persistent domain model for provider-backed managed channels.

## Out Of Scope

- no runtime merge yet
- no provider execution changes yet
- no plan migration yet

## Product Contract

The new channel model should be able to represent:

- provider identity
- connection settings
- enabled models
- provider-specific deployment mapping
- per-model pricing overrides

## Required Domain Properties

### Channel level

- `name`
- `slug`
- `providerType`
- `enabled`
- `sortOrder`
- `description`
- `connection`
- `secrets`

### Model entry level

- `model`
- `enabled`
- provider-specific mapping such as `deploymentName`
- `pricingOverride`

### Pricing override shape

Must support at least:

- `prompt`
- `completion`
- optional `write`
- optional `read`

Do not model pricing as a single `rate`.

## Design Rule

The managed channel should be serializable into the same effective runtime structures already consumed by HumLibreChat.

## Files Expected To Change

- `packages/data-schemas/src/schema/`
- `packages/data-schemas/src/types/`
- `packages/data-provider/src/types/queries.ts`
- `packages/api/src/admin/`
- `client/src/components/Admin/Channels/`

## Acceptance Criteria

- a new managed channel schema exists
- schema supports both `custom` and `azureOpenAI`
- pricing overrides match HumLibreChat token accounting semantics
- legacy overlay-only assumptions are removed from the new model

## Cut Line

This slice is done when the data model is stable enough that runtime merge work can begin without changing the shape again.
