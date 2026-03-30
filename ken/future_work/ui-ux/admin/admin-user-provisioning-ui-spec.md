# Phase 4 Slice 3: Admin User Provisioning UI

## Goal

Show plan provisioning state in admin user detail and add one guarded action for explicit starting-credit application.

## Out Of Scope

- no dashboard
- no plan form redesign
- no automatic background polling

## UX Contract

The admin should be able to answer these questions from one screen:

- does this user currently have a balance record
- what is the assigned plan's `startingCredits`
- were plan starting credits already applied for the current plan
- can I intentionally apply them now

## Suggested UI Placement

Extend the existing admin user detail stack near:

- `AdminUserBalanceCard`
- `AdminUserPlanCard`

Recommended addition:

- `AdminUserProvisioningCard`

## Files Expected To Change

- `client/src/components/Admin/Users/AdminUserDetail.tsx`
- `client/src/components/Admin/Users/AdminUserProvisioningCard.tsx`
- `client/src/components/Admin/Users/__tests__/AdminUserProvisioningCard.spec.tsx`
- `client/src/data-provider/Admin/mutations.ts`
- `packages/data-provider/src/types/queries.ts`
- `client/src/locales/en/translation.json`

## Behavior Rules

- hide or disable the action when balance is disabled
- hide or disable the action when there is no assigned plan
- hide or disable the action when the plan has no positive `startingCredits`
- action must be explicit and not fire automatically from the UI
- success should refresh admin user detail state

## Acceptance Criteria

- admin user detail shows provisioning state clearly
- admin can intentionally apply starting credits from the UI
- UI reflects no-op states without pretending a balance mutation happened

## Test Scope

- focused render/mutation state tests for the new card
- avoid broad page snapshots

## Cut Line

This slice is done when the admin can understand provisioning state and trigger the explicit action without leaving the user detail page.
