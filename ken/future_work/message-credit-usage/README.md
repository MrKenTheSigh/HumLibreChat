# Message Credit Usage Slice Index

This workstream makes credit consumption visible to end users without exposing token accounting by default.

## Workstream Description

The product goal is throttling through visibility:

- users should immediately see how much a single assistant response cost in system credits
- users should immediately see how much current-period credit remains
- users should only see token accounting details when they explicitly ask for them

This workstream therefore separates:

- user-facing `credit` summaries
- transaction-backed accounting details

## Design Principles

- `credit` is the default user-facing unit
- `Transaction` remains the accounting source of truth
- `Message` should carry a denormalized per-message credit summary for cheap chat rendering
- quota/progress should come from a current-period quota summary, not from refill inference

## Slice Order

1. `message-credit-summary-schema-spec.md`
2. `message-credit-writeback-spec.md`
3. `message-usage-detail-api-spec.md`
4. `quota-summary-api-spec.md`
5. `chat-credit-ui-spec.md`

## Dependency Flow

- Slice 1 lands first because every later change depends on a stable message-level summary field.
- Slice 2 lands next because the UI should read precomputed message summaries instead of aggregating transactions on every render.
- Slice 3 can land after Slice 2 because it exposes details-on-demand from existing accounting data.
- Slice 4 can proceed in parallel with late-stage Slice 2 work if quota inputs are already available.
- Slice 5 depends on Slices 1, 2, and 4 for the default UI, and optionally Slice 3 for detail affordances.

## Guardrails

- do not redesign pricing logic in this workstream
- do not expose token breakdown in the default chat payload
- do not create a second accounting ledger
- do not make the progress bar depend on auto-refill semantics
- do not block normal chat rendering on transaction aggregation joins

## Review Standard

Each slice should be approved only if all of the following are true:

- the user-facing default is still `credit`, not `token`
- the runtime source of truth remains `Transaction`
- message rendering does not require a second query to show simple spend
- the API contract is concrete enough to implement without reopening product decisions
- testing scope stays narrow and verifiable

## Exit Condition

This workstream is complete when:

- newly generated assistant messages can show direct credit consumption
- account UI can show current-period total, used, and remaining credits
- token details are available only through explicit inspection
- the implementation does not introduce a second ledger or a read-time transaction join for normal chat rendering
