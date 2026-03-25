# Admin Backoffice Phase 2

## Phase Description

Phase 2 adds the business control layer that HumLibreChat does not currently have: admin-managed plans and admin-managed channels.

The design constraint for this phase is important:

- keep HumLibreChat's existing endpoint and model configuration flow
- do not replace `librechat.yaml` as the source of provider setup
- model "channels" as an overlay over valid `endpoint + model` combinations that already exist

## Planned Outcomes

- define `AdminPlan`
- define `AdminChannel`
- assign a plan to a user
- allow admins to manage plan and channel CRUD from the client

## Expected New Data

- `AdminPlan`
- `AdminChannel`
- user fields for plan assignment

## Expected Main Deliverables

- admin plans API
- admin channels API
- admin pages for plans and channels
- validation that channel entries only reference supported endpoint/model combinations

## Exit Condition

This phase is complete when an admin can define plans and channels in the UI and assign a plan to a user, even if the plan restrictions are not yet enforced during chat execution.
