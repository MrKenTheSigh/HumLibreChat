# Phase 4 Slice 1: Provisioning Policy Helper

## Goal

Create one shared backend helper that resolves and applies plan-based starting credits under a narrow policy.

This slice is the source of truth for every later Phase 4 action.

## Out Of Scope

- no admin route wiring yet
- no frontend UI changes
- no reporting
- no balance clawback logic

## Internal Contract

Add `packages/api/src/admin/provisioning.ts`.

Suggested exports:

```ts
type ProvisioningSource = 'plan_assignment_auto_seed' | 'admin_manual_apply';

type ProvisioningState = {
  balanceEnabled: boolean;
  hasBalanceRecord: boolean;
  currentBalance: number;
  currentPlanStartingCredits: number | null;
  appliedAt: string | null;
  appliedPlanId: string | null;
  appliedAmount: number | null;
  appliedSource: ProvisioningSource | null;
  appliedPlanMatchesCurrent: boolean;
  canApplyStartingCredits: boolean;
};

type ApplyStartingCreditsResult = {
  applied: boolean;
  reason:
    | 'applied'
    | 'balance_disabled'
    | 'no_plan'
    | 'plan_has_no_starting_credits'
    | 'existing_balance_record';
  tokenCredits: number;
  provisioning: ProvisioningState;
};
```

## Policy Rules

- if balance is disabled, do not apply credits
- if the user has no assigned plan, do not apply credits
- if the plan has no positive `startingCredits`, do not apply credits
- auto-seed on plan assignment only when there is no balance record
- manual apply may add credits even when a balance record already exists
- successful application must record metadata showing when, how, and for which plan the credits were applied

## Data Sources

- `User`
- `AdminPlan`
- `Balance`
- `Transaction`
- app balance config

## Files Expected To Change

- `packages/api/src/admin/provisioning.ts`
- `packages/api/src/admin/provisioning.spec.ts`
- `packages/api/src/admin/index.ts`
- `packages/data-schemas/src/schema/user.ts`
- `packages/data-schemas/src/types/user.ts`

## Acceptance Criteria

- helper reports provisioning state for plan/no-plan users
- auto-seed applies only when no balance record exists
- auto-seed does not overwrite an existing balance record
- manual apply increments existing balance
- successful application records durable metadata for later admin display

## Test Scope

- service tests only
- cover balance disabled, no plan, zero starting credits, auto-seed, and manual apply

## Cut Line

This slice is done when the provisioning helper is deterministic and fully tested, even if no route or UI uses it yet.
