# Admin Backoffice Phase 4

## Phase Description

Phase 4 connects `AdminPlan.startingCredits` to HumLibreChat's existing balance system.

This phase is intentionally separate from Phase 3:

- Phase 3 decides access
- Phase 4 decides provisioning policy

Keeping them separate avoids mixing runtime authorization with credit mutation in the same rollout.

## Planned Outcomes

- document and implement the balance provisioning policy for plans
- apply plan starting credits only in explicitly approved scenarios
- expose plan/balance provisioning state in admin user detail
- add one narrow admin action for intentional application of starting credits

## Policy Baseline

- `Balance.tokenCredits` remains the only runtime balance source
- `startingCredits` is a provisioning helper, not a second ledger
- assigning a plan should not automatically overwrite an existing non-empty balance
- clearing or changing a plan should not silently reduce balance

## Readiness Assessment

Phase 4 is complete.

Required prerequisites are already present:

- `AdminPlan.startingCredits`
- admin user detail and balance actions
- plan assignment APIs and UI
- a stable post-Phase-3 access baseline

Not required before Phase 4:

- a second quota ledger
- usage reporting UI
- automatic downgrade or clawback policy

## Current Implementation Status

All three slices are implemented in code:

- provisioning helper and policy metadata
- admin API for explicit starting-credit application
- admin user detail card for provisioning state and manual apply

Acceptance validation also confirmed the expected runtime behavior:

- automatic seed only runs for users without a balance record
- explicit admin apply updates balance and provisioning state
- repeated apply for the same current plan is blocked after the applied state is stored

## Slice Order

1. `provisioning-policy-helper-spec.md`
2. `apply-starting-credits-api-spec.md`
3. `admin-user-provisioning-ui-spec.md`

## Default Policy Decisions

These rules are fixed for this phase unless a later review changes them:

- `Balance.tokenCredits` remains the only runtime balance source.
- plan assignment may auto-seed credits only when the user has no balance record
- auto-seed must not run when the plan has no positive `startingCredits`
- manual application adds the plan's `startingCredits` to the existing balance
- clearing or changing a plan must not reduce balance
- provisioning state should be visible from admin user detail without database access

## Review Standard

Each slice should be approved only if all of the following are true:

- plan provisioning behavior is deterministic and narrow
- existing balances are never silently overwritten in the automatic path
- explicit application is visible and intentional in the admin UI
- policy state is inspectable from user detail data
- tests cover both no-balance and existing-balance cases

## Exit Condition

This exit condition is now met. An admin can understand and control plan-based provisioning without needing database access or manual scripts, and the behavior is narrow enough that it does not silently overwrite an existing balance.
