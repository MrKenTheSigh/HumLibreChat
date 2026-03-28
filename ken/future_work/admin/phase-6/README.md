# Admin Backoffice Phase 6

## Phase Description

Phase 6 redesigns `Channel` so it becomes a real provider-backed runtime configuration object instead of an entitlement overlay.

This phase also defines the migration from the current `plan -> channel` relationship to the desired `plan -> model` relationship.

## Product Goal

An admin should be able to:

- create and manage AI channels from the admin UI
- configure connection details and enabled models for those channels
- define pricing overrides per model in a way that matches HumLibreChat's token accounting
- stop relying on hand-edited `.env` and `librechat.yaml` for normal provider/channel administration
- eventually assign plans directly to model entitlements instead of channel groups

## Scope Boundary

This phase is not a rewrite of the provider runtime.

The preferred implementation is:

- database-managed config
- merged into the existing runtime config shape
- existing endpoint initialization reused as much as possible

## Key Reality Checks

### 1. The current Channel is only an overlay

The existing `AdminChannel` does not control:

- API keys
- base URLs
- Azure deployment config
- endpoint token pricing
- runtime endpoint/model inventory

It only controls entitlement over already-existing `(endpoint, model)` pairs.

### 2. Token pricing is not a single number

HumLibreChat pricing currently supports:

- `prompt`
- `completion`
- optional cache token rates such as `write` and `read`

That means any channel-level pricing feature must be modeled as a pricing override object, not a single `rate` value.

### 3. `plan -> channel` is transitional only

The final entitlement model should allow plans to select specific models across channels.

Example:

- one plan may only allow the weakest model from each enabled channel

That means channel redesign and entitlement redesign should be planned together, but implemented in stages.

## Target End State

### Managed Channel

A channel becomes the unit that defines:

- provider type
- connection config
- secrets or secret references
- enabled models
- per-model pricing overrides

### Managed Plan

A plan becomes the unit that defines:

- what models a user may access
- optional grouping by channel for admin UX only
- optional defaults such as starter credits

### Runtime Resolution

Runtime should resolve from:

- database-managed channels
- merged with bootstrap YAML/env config where needed
- then exposed through existing endpoint/model initialization

## Recommended Migration Strategy

### Stage 1

Introduce new managed runtime channels in parallel with the current overlay channel system.

### Stage 2

Use managed channels as the source of runtime endpoint/model availability.

### Stage 3

Keep plans pointing to channels temporarily while runtime stabilizes.

### Stage 4

Add model-level plan entitlements and migrate plans away from channel-only restriction.

### Stage 5

Remove or retire the legacy overlay channel implementation.

## Initial Provider Priority

Start with:

1. `custom` / OpenAI-compatible providers
2. `azureOpenAI`
3. native managed providers layered onto existing runtime families:
   - `openAI`
   - `google`
   - `anthropic`
   - `bedrock`

Reason:

- `custom` already fits the existing `endpoints.custom[]` model well
- `custom` already supports `tokenConfig` / `endpointTokenConfig`
- `azureOpenAI` is important but requires extra runtime mapping work
- the standard runtime families can be attached safely by merging managed config into the existing top-level endpoint config

## Slice Order

1. `managed-channel-domain-spec.md`
2. `runtime-config-merge-spec.md`
3. `managed-custom-channels-spec.md`
4. `managed-azure-channels-spec.md`
5. `plan-model-entitlements-migration-spec.md`

## Current Status

- Slice 1 is complete.
- Slice 2 is complete.
- Slice 3 is complete.
- Slice 4 is complete.
- Slice 5 is complete.
- The persistent admin channel shape and admin CRUD/UI now use the managed provider-backed domain.
- Legacy `entries[]` channel records are normalized on read for compatibility.
- Enabled managed channels are merged into the effective runtime config before endpoint/model initialization.
- Managed custom channels now append runtime entries to `endpoints.custom`.
- Managed Azure channels now append runtime groups to `endpoints.azureOpenAI.groups`.
- Managed `openAI`, `google`, `anthropic`, and `bedrock` channels now merge directly into their existing top-level runtime endpoint families.
- Runtime config caches are cleared after admin channel create, update, and delete operations.
- Managed custom channels now contribute partial `tokenConfig` pricing overrides.
- Managed Azure channels now contribute partial group-level `tokenConfig` pricing overrides.
- Managed `openAI`, `google`, `anthropic`, and `bedrock` channels now contribute partial endpoint-level `tokenConfig` pricing overrides where the runtime family supports them.
- Custom endpoint initialization now merges fetched token metadata with admin-configured pricing overrides.
- Azure initialization now attaches managed group token config through the existing `groupMap` and `modelGroupMap` path.
- OpenAI, Google, Anthropic, and Bedrock initialization now read managed secrets, connection config, and pricing overrides without requiring hand-edited bootstrap config.
- Admin usage reporting now exposes per-transaction `rate` and `rateDetail`.
- Plans can now express direct model entitlements while `channelIds` remain available as a compatibility layer.
- Access resolution now prioritizes model entitlements and only falls back to legacy `channelIds` when needed.
- The admin plan form now edits model entitlements directly by channel/model selection.

## Exit Condition

This phase is complete when:

- an admin can manage real runtime channels from the UI
- those channels control runtime availability without hand-editing config files
- plan restrictions can move toward model-level entitlements without reworking the runtime again

Phase 6 is now functionally complete under that cut line.

Still out of scope under this phase:

- `assistants` and `azureAssistants`
- `agents`
- rewriting the runtime so one provider family can host multiple separate managed top-level configs at once
