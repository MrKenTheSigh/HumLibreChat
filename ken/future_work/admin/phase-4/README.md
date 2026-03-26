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

## Suggested Slice Order

1. policy and backend provisioning helper
2. admin endpoint for explicit application
3. admin UI state and action wiring

## Exit Condition

This phase is complete when an admin can understand and control plan-based provisioning without needing database access or manual scripts, and when the behavior is narrow enough that it cannot accidentally wipe an existing balance.
