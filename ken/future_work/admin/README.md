# HumLibreChat Admin Backoffice Implementation Plan

This directory is the entry point for the HumLibreChat admin backoffice planning set.

Related admin-surface UI/UX planning docs now live in `../ui-ux/admin/`.

## Phase Directories

- `phase-1/`: admin foundation, users, balance actions, and conversation audit
- `phase-2/`: plans and channel overlay on top of existing endpoint/model config
- `phase-3/`: access enforcement and user entitlements
- `phase-4/`: plan-linked balance provisioning and credit policy
- `phase-5/`: usage reporting based on existing transaction data
- `phase-6/`: managed runtime channels and plan-to-model migration
- `phase-7/`: custom role management and dynamic role assignment

## Locked Decisions

- Preserve HumLibreChat's current architecture.
- Keep quota/billing on HumLibreChat's existing global `Balance.tokenCredits`.
- Build the admin backoffice inside the existing `client` app.
- Prefer `SystemRoles.ADMIN` as the first access gate. Do not introduce a second large RBAC system in the first pass.
- Do not edit `.env` or `librechat.yaml` from the admin UI as the primary configuration path.
- If provider/channel configuration moves into the database, feed it into the existing runtime through config merging instead of replacing the runtime client stack.
- `plan -> channel` is now a transition state only. The end state should be `plan -> model entitlement`.

## Current Readiness

Phase 5 is complete. Phase 6 is complete. Phase 7 is in progress.

What is already in place:

- Phase 1 admin console for users, balances, and conversation audit
- Phase 2 admin entities for `AdminPlan`, `AdminChannel`, and user plan assignment
- admin UI flows for plans, channels, and assignment
- channel inventory validation tied to current HumLibreChat config
- runtime plan enforcement on backend model validation
- authenticated user entitlements API
- frontend filtering for endpoint, model, model spec, and mention choices

What is now in place for Phase 4:

- provisioning metadata is stored on the user document
- plan assignment auto-seeds `startingCredits` only when no balance record exists
- admin user detail exposes provisioning state
- admin can explicitly apply the current plan's starting credits once per current plan
- repeated application for the same current plan is blocked after the applied state is recorded

What is now in place for Phase 5:

- admin transactions API with cursor pagination
- admin usage summary API based on existing `Transaction` data
- admin usage dashboard route in the existing client app
- shared filtering across usage summary and paginated transaction listing

What is still deferred:

- charts and richer visual analytics
- CSV export and scheduled reporting
- endpoint- or channel-level reporting that requires data not currently stored in `Transaction`
- richer model-level policy UX such as templated "weakest model from every enabled channel" assignment
- phase-7 permission UX polish beyond the initial role catalog and assignment flows

What is now in place for Phase 6 slice 1:

- `AdminChannel` has been upgraded from overlay-style `entries[]` to a managed domain shape with:
  - `providerType`
  - `connection`
  - `secrets`
  - `models`
  - per-model `pricingOverride`
- admin channel CRUD and admin channel UI now edit the managed channel shape directly
- legacy stored `entries[]` channel documents are normalized when read
- phase 3 entitlement enforcement still works because backend access resolution adapts managed channels back into the existing `allowedPairs` contract

What is now in place for Phase 6 slice 2:

- enabled managed channels are merged into the effective runtime config before `AppService` builds endpoint/model state
- managed custom channels contribute to `endpoints.custom`
- managed Azure channels contribute to `endpoints.azureOpenAI.groups`
- managed `openAI`, `google`, `anthropic`, and `bedrock` channels contribute to their existing top-level runtime endpoint families
- duplicate runtime endpoint names, Azure groups, and Azure model names are skipped safely with warnings instead of breaking startup
- admin channel create, update, and delete operations now clear runtime config caches so managed channel changes can take effect without a process restart

What is now in place for Phase 6 slice 3:

- managed custom channels can now attach partial `tokenConfig` pricing overrides to runtime config
- custom endpoint initialization merges fetched token config with admin-configured pricing overrides instead of forcing one source to win
- token accounting now falls back to built-in pricing when an override only covers part of a model's token config
- admin usage reporting now exposes stored transaction `rate` and `rateDetail` values

What is now in place for Phase 6 slice 4:

- managed Azure channels can now attach partial group-level `tokenConfig` pricing overrides to runtime config
- Azure initialization reads managed group token config through the existing `groupMap` and `modelGroupMap` flow
- Azure pricing overrides now affect runtime token accounting without introducing a second Azure runtime path
- managed `openAI`, `google`, `anthropic`, and `bedrock` channels now read secrets and connection config directly from admin-managed runtime config
- managed `openAI`, `google`, `anthropic`, and `bedrock` channels now attach partial endpoint-level pricing overrides where their runtime families support it

What is now in place for Phase 6 slice 5:

- `AdminPlan` now supports direct `modelEntitlements`
- plan access resolution prioritizes model entitlements and only falls back to `channelIds` for legacy plans
- the admin plan form now edits model entitlements by selecting models under each channel
- legacy plans can be migrated incrementally because channel-based fallback remains available until a plan is resaved with model entitlements

## Phase 7 Direction

Phase 7 should replace the remaining hard-coded `ADMIN`/`USER` assumptions with a database-backed role catalog while preserving one immutable `ADMIN` role.

The immediate goal is not a second RBAC system. The goal is to let admins:

- create and edit named roles
- assign those roles to users
- keep the existing permission matrix model
- prevent deletion of the built-in `ADMIN` role

What is now in place for Phase 7:

- `Role` metadata now supports system/editable/deletable state and seeded descriptions
- admin roles API exists for list, get, create, update, and delete
- the built-in `ADMIN` role remains non-deletable
- auth/client role loading now resolves the signed-in user's actual role document
- admin settings dialogs can switch across the dynamic role catalog
- admin users can be created with any existing role and reassigned later
- interface permission sync now applies to custom roles using the `USER` role as the fallback template
- right-side control panel visibility for `Parameters`, `Attach files`, `Agents`, and `MCP Servers` is now driven by role permissions first

What is still deferred for Phase 7:

- panel-internal availability rules for `Agents` and `MCP Servers`
- reconciling role-based visibility with builder disablement, empty-state behavior, and available-server discovery

The main constraint is that the current system does not only hard-code roles in the UI. It also hard-codes them in:

- role initialization and default seeding
- user creation defaults
- auth context role loading
- admin permission dialogs that only switch between `USER` and `ADMIN`
- some middleware and login strategies that demote or default users to `USER`

That means Phase 7 must change the role-loading path end to end, not just add a CRUD page.

## Target Outcomes

The target is to add an admin-only area that can do the following:

1. Manage all users.
2. Adjust balances and issue temporary bans.
3. Assign plans that limit which models/channels a user can use.
4. Define admin-managed channels without changing the underlying provider architecture.
5. Search and inspect all conversations and messages.
6. View usage from existing transaction data.
7. Apply plan-based credit provisioning without replacing HumLibreChat's balance model.
8. Manage provider-backed channels from the admin UI without hand-editing runtime config files.
9. Move plan restrictions from channel-level to model-level entitlements.
10. Manage custom roles from the admin UI and assign them to users.

## Architecture Direction

The safest path is still to add on top of HumLibreChat's current primitives, but the current Phase 2 channel overlay is no longer the desired end state.

- Provider setup may start in `librechat.yaml`, but Phase 6 should allow admin-managed database channels to become the primary editable source.
- Database-managed channel/provider config should be merged into the existing runtime `appConfig` shape before endpoint/model initialization.
- Balance remains the source of truth for remaining credits.
- Admin APIs live in `/api/admin/*`, but their implementation should live in `packages/api/src/admin/*`.
- New persistent entities live in `packages/data-schemas`.
- Client-side admin pages live under `client/src/routes` and `client/src/components/Admin`.
- The current `AdminChannel` entity may be replaced rather than preserved if replacement is cleaner.

## Proposed Domain Model

### 1. Legacy AdminChannel

Purpose: create business-facing channel definitions without changing the low-level provider config.

Suggested fields:

- `name`
- `slug`
- `description`
- `enabled`
- `sortOrder`
- `icon`
- `entries`
  - `endpoint`
  - `model`
  - `label`
  - `defaultSpec`
  - `enabled`

Key rule:

- This was sufficient for Phase 2 and Phase 3.
- This is no longer the desired end-state channel model.

### 2. Managed Runtime Channel

Purpose: become the actual admin-managed provider/model configuration object.

Suggested fields:

- `name`
- `slug`
- `providerType`
- `enabled`
- `sortOrder`
- `connection`
  - provider-specific connection fields
  - secret references or encrypted secrets
- `models`
  - `model`
  - provider-specific deployment mapping
  - `enabled`
  - `pricingOverride`

Key rules:

- Managed channels should be convertible into the same normalized runtime structures HumLibreChat already uses.
- They should not require rewriting endpoint initialization for every provider.
- They should support provider-specific configuration, especially `custom`, `azureOpenAI`, `openAI`, `google`, `anthropic`, and `bedrock`.

### 3. Transitional AdminPlan

Purpose: define what a user may access during the migration period.

Suggested fields:

- `name`
- `slug`
- `description`
- `enabled`
- `isDefault`
- `sortOrder`
- `channelIds` during transition
- later `modelEntitlements`
- `notes`
- optional `startingCredits`

Key rule:

- `startingCredits` is a helper for provisioning, not a new quota engine.
- Actual remaining usage still comes from `Balance.tokenCredits`.
- The final entitlement target should be model-level, not channel-level.

### 4. User Extension

Extend the existing user document with:

- `adminPlanId`
- `adminPlanAssignedAt`

Do not add a permanent banned flag in MongoDB for the first pass.

- Existing temporary ban flow is cache-based already.
- Admin ban/unban APIs should reuse that behavior.

### 5. Usage Reporting

Initial implementation should use existing `Transaction` records.

- No new usage ledger in the first phase.

### 6. Managed Role

Purpose: become the editable role object used by users, permission checks, and admin tooling.

Suggested fields:

- `name`
- `description`
- `permissions`
- `isSystem`
- `isEditable`
- `isDeletable`

Key rules:

- `ADMIN` must always exist.
- `ADMIN` must not be deletable.
- The system should keep one fallback role for newly created users.
- Existing permission semantics should stay unchanged; Phase 7 changes who can own a role, not how permission bits behave.
- If reporting proves insufficient later, add a summary collection after the admin surface is already working.

## Phase Plan

## Phase 6: Managed Runtime Channels And Plan-To-Model Migration

This phase replaces the current overlay-style channel design with database-managed runtime channels, then moves plans from channel assignment toward model entitlement.

See `phase-6/README.md` for the current detailed plan.

## Phase 1: Admin Foundation, Users, Conversations

This phase delivers the first useful admin backoffice with the least architectural risk.

### Backend

Add thin JS route wrappers in `api/server/routes/admin/`:

- `api/server/routes/admin/users.js`
- `api/server/routes/admin/conversations.js`
- `api/server/routes/admin/balance.js`

Update:

- `api/server/routes/index.js`
- `api/server/index.js`

Implement real logic in `packages/api/src/admin/`:

- `packages/api/src/admin/users.ts`
- `packages/api/src/admin/conversations.ts`
- `packages/api/src/admin/balance.ts`
- `packages/api/src/admin/ban.ts`
- `packages/api/src/admin/index.ts`

Recommended API surface:

- `GET /api/admin/users`
- `GET /api/admin/users/:userId`
- `PATCH /api/admin/users/:userId`
- `POST /api/admin/users/:userId/balance/add`
- `POST /api/admin/users/:userId/balance/set`
- `POST /api/admin/users/:userId/ban`
- `DELETE /api/admin/users/:userId/ban`
- `GET /api/admin/conversations`
- `GET /api/admin/conversations/:conversationId`
- `GET /api/admin/conversations/:conversationId/messages`

Recommended filters:

- users: `search`, `role`, `provider`, `emailVerified`
- conversations: `userId`, `search`, `endpoint`, `model`, `createdAfter`, `createdBefore`

### Data Layer

Extend `packages/data-provider`:

- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/types/queries.ts`
- `packages/data-provider/src/types/mutations.ts`

Add new client query modules:

- `client/src/data-provider/Admin/queries.ts`
- `client/src/data-provider/Admin/mutations.ts`
- `client/src/data-provider/Admin/index.ts`

Suggested query keys:

- `adminUsers`
- `adminUser`
- `adminConversations`
- `adminConversation`
- `adminConversationMessages`
- `adminUsage`
- `adminPlans`
- `adminChannels`

### Frontend

Add a new admin dashboard area under `/d/admin/*`.

Route changes:

- update `client/src/routes/Dashboard.tsx`
- add `client/src/components/Admin/AdminView.tsx`
- add `client/src/components/Admin/AdminLayout.tsx`

Initial pages:

- `client/src/components/Admin/Users/AdminUsersPage.tsx`
- `client/src/components/Admin/Users/AdminUserDetail.tsx`
- `client/src/components/Admin/Conversations/AdminConversationsPage.tsx`
- `client/src/components/Admin/Conversations/AdminConversationDetail.tsx`

Recommended route tree:

- `/d/admin/users`
- `/d/admin/users/:userId`
- `/d/admin/conversations`
- `/d/admin/conversations/:conversationId`

Access gate:

- frontend hide unless `user.role === SystemRoles.ADMIN`
- backend always enforce with existing `requireAdmin`

### Notes

This phase should reuse existing collections only:

- `User`
- `Balance`
- `Conversation`
- `Message`
- `Transaction`

That keeps the first delivery mostly additive.

## Phase 2: Plans And Channel Overlay

This phase adds the business controls that resemble `hum`, but without replacing HumLibreChat's provider architecture.

### New Schemas

Add:

- `packages/data-schemas/src/schema/adminPlan.ts`
- `packages/data-schemas/src/schema/adminChannel.ts`
- `packages/data-schemas/src/types/adminPlan.ts`
- `packages/data-schemas/src/types/adminChannel.ts`
- `packages/data-schemas/src/models/adminPlan.ts`
- `packages/data-schemas/src/models/adminChannel.ts`
- `packages/data-schemas/src/methods/adminPlan.ts`
- `packages/data-schemas/src/methods/adminChannel.ts`

Update exports:

- `packages/data-schemas/src/schema/index.ts`
- `packages/data-schemas/src/types/index.ts`
- `packages/data-schemas/src/models/index.ts`
- `packages/data-schemas/src/methods/index.ts`

Extend user schema/types:

- `packages/data-schemas/src/schema/user.ts`
- `packages/data-schemas/src/types/user.ts`

New user fields:

- `adminPlanId`
- `adminPlanAssignedAt`

### Backend

Add admin APIs:

- `GET /api/admin/plans`
- `POST /api/admin/plans`
- `PATCH /api/admin/plans/:planId`
- `DELETE /api/admin/plans/:planId`
- `GET /api/admin/channels`
- `POST /api/admin/channels`
- `PATCH /api/admin/channels/:channelId`
- `DELETE /api/admin/channels/:channelId`
- `POST /api/admin/users/:userId/plan`

Implementation files:

- `packages/api/src/admin/plans.ts`
- `packages/api/src/admin/channels.ts`

Thin wrappers:

- `api/server/routes/admin/plans.js`
- `api/server/routes/admin/channels.js`

### Frontend

Add pages:

- `client/src/components/Admin/Plans/AdminPlansPage.tsx`
- `client/src/components/Admin/Plans/AdminPlanForm.tsx`
- `client/src/components/Admin/Channels/AdminChannelsPage.tsx`
- `client/src/components/Admin/Channels/AdminChannelForm.tsx`

Suggested routes:

- `/d/admin/plans`
- `/d/admin/channels`

### Important Constraint

Do not let channels create new provider credentials.

Instead:

- fetch the existing endpoint/model inventory from current config endpoints
- let admins compose channels from those already-supported combinations

This keeps the change aligned with HumLibreChat.

## Phase 3: Access Enforcement

This phase makes plans actually restrict what a user can use.

### Enforcement Rule

Before a chat request is processed:

1. Resolve the selected `endpoint + model`.
2. Resolve the user's assigned `AdminPlan`.
3. Resolve whether that pair is allowed by one of the plan's `AdminChannel` entries.
4. If not allowed, reject with a clear 403 response.

### Backend Hook Point

Do not redesign endpoint initialization.

Add a narrow access check in the chat request path before model execution begins.

Candidate integration points to evaluate during implementation:

- request validation middleware used before generation
- endpoint/model resolution path in `packages/api/src/endpoints/*`
- existing request preprocessing in `/api` route handlers

The access check should live in `packages/api/src/admin/access.ts`, then be called from the smallest existing choke point available.

### Frontend Behavior

After backend enforcement works, improve UX by filtering visible choices.

Add an admin entitlement response for the current user:

- `GET /api/user/entitlements`

Response should include:

- `planId`
- allowed channels
- allowed endpoint/model pairs

Then filter UI selection lists in the existing endpoint/model selectors instead of building a parallel selector.

This is safer than replacing current chat setup UI.

## Phase 4: Plan Balance Provisioning

This phase connects `AdminPlan.startingCredits` to HumLibreChat's existing `Balance.tokenCredits` model without turning plans into a second quota engine.

### Goals

- define when `startingCredits` should apply
- keep `Balance.tokenCredits` as the only runtime balance source
- avoid overwriting manually adjusted balances by surprise
- expose the policy clearly in admin UI and APIs

### Recommended Policy Direction

- Do not change balance automatically on every plan assignment.
- Only seed balance automatically when the user has no balance record yet.
- Add an explicit admin action to apply plan starting credits when manual provisioning is intended.
- Do not silently reduce balance when a plan is removed or downgraded.

### Backend

Add narrow plan-aware provisioning helpers in `packages/api/src/admin/`.

Suggested endpoints:

- `POST /api/admin/users/:userId/plan/apply-starting-credits`
- optional `POST /api/admin/users/:userId/plan/reseed-balance`

Implementation should reuse the existing balance service rather than inventing a second credit store.

### Frontend

Extend the existing admin user detail and plan views to show:

- whether the current user has a balance record
- whether plan starting credits have been applied
- a guarded button for explicit application when needed

### Exit Condition

This phase is complete when:

- the balance policy is explicit and documented in code and UI
- admins can provision plan starting credits intentionally
- automatic provisioning only happens in the narrowly approved scenario

## Phase 5: Usage Reporting

This phase exposes admin reporting using current transaction data.

### Backend

Add:

- `GET /api/admin/usage/summary`
- `GET /api/admin/usage/transactions`

Implementation file:

- `packages/api/src/admin/usage.ts`

Thin wrapper:

- `api/server/routes/admin/usage.js`

Suggested summary cuts:

- by user
- by model
- by endpoint
- by date range

### Frontend

Add:

- `client/src/components/Admin/Usage/AdminUsagePage.tsx`

Suggested views:

- top users by spend
- top models by spend
- recent transactions table

### Deferred Decision

If `Transaction` data is not enough for the reporting UX, add a summary collection later.

Do not add that complexity before confirming the first reporting screen is blocked.

## File-Level Blueprint

## New Files

### `packages/data-schemas`

- `src/schema/adminPlan.ts`
- `src/schema/adminChannel.ts`
- `src/types/adminPlan.ts`
- `src/types/adminChannel.ts`
- `src/models/adminPlan.ts`
- `src/models/adminChannel.ts`
- `src/methods/adminPlan.ts`
- `src/methods/adminChannel.ts`

### `packages/api`

- `src/admin/index.ts`
- `src/admin/users.ts`
- `src/admin/balance.ts`
- `src/admin/ban.ts`
- `src/admin/conversations.ts`
- `src/admin/plans.ts`
- `src/admin/channels.ts`
- `src/admin/access.ts`
- `src/admin/provisioning.ts`
- `src/admin/usage.ts`

### `api/server/routes/admin`

- `users.js`
- `balance.js`
- `conversations.js`
- `plans.js`
- `channels.js`
- `provisioning.js`
- `usage.js`

### `client`

- `src/components/Admin/AdminLayout.tsx`
- `src/components/Admin/AdminView.tsx`
- `src/components/Admin/Users/AdminUsersPage.tsx`
- `src/components/Admin/Users/AdminUserDetail.tsx`
- `src/components/Admin/Conversations/AdminConversationsPage.tsx`
- `src/components/Admin/Conversations/AdminConversationDetail.tsx`
- `src/components/Admin/Plans/AdminPlansPage.tsx`
- `src/components/Admin/Plans/AdminPlanForm.tsx`
- `src/components/Admin/Channels/AdminChannelsPage.tsx`
- `src/components/Admin/Channels/AdminChannelForm.tsx`
- `src/components/Admin/Usage/AdminUsagePage.tsx`
- `src/data-provider/Admin/queries.ts`
- `src/data-provider/Admin/mutations.ts`
- `src/data-provider/Admin/index.ts`

## Existing Files To Update

### `packages/data-schemas`

- `src/schema/user.ts`
- `src/types/user.ts`
- `src/schema/index.ts`
- `src/types/index.ts`
- `src/models/index.ts`
- `src/methods/index.ts`

### `packages/data-provider`

- `src/api-endpoints.ts`
- `src/data-service.ts`
- `src/keys.ts`
- `src/types/queries.ts`
- `src/types/mutations.ts`

### `api`

- `api/server/index.js`
- `api/server/routes/index.js`

### `client`

- `client/src/routes/Dashboard.tsx`
- `client/src/routes/index.tsx` only if route composition needs shared guards
- `client/src/data-provider/index.ts` if the repo currently re-exports feature hooks there
- `client/src/locales/en/translation.json`

## Recommended Delivery Order

1. Admin users list/detail and balance actions.
2. Admin conversations list/detail.
3. Plan and channel CRUD.
4. Backend access enforcement.
5. Frontend filtering based on entitlements.
6. Plan-linked balance provisioning.
7. Usage dashboard.

## Why This Order

- It gives usable admin value early.
- It avoids touching the model execution path until the admin data model is stable.
- It keeps credit policy work separate from access enforcement so the runtime path stays simpler.
- It keeps the first merge sets small and testable.

## Testing Plan

### Backend

- add Jest coverage for each new admin service in `packages/api`
- add route tests for each new `/api/admin/*` wrapper in `api/server/routes`
- cover 401, 403, success, invalid input, not found

### Frontend

- render tests for admin pages
- query/mutation tests around optimistic updates only where needed
- route guard tests for admin-only pages

### Integration

- admin user can list users
- admin can change balance
- non-admin gets 403
- plan-restricted user cannot call blocked model
- admin can inspect another user's conversation messages

## Main Risks

1. The enforcement hook may be placed too late in the request path and become endpoint-specific.
2. Channel definitions may drift from actual config inventory if validation is weak.
3. Usage reporting from `Transaction` may be good enough for tables but not for complex dashboards.
4. Admin pages can sprawl quickly if the first UI structure is not modular.

## Mitigations

1. Keep one shared access service in `packages/api/src/admin/access.ts`.
2. Validate every channel entry against current endpoint/model inventory at create/update time.
3. Start with tables and lightweight summaries before inventing a new usage model.
4. Keep each admin feature in its own folder and route section.

## Recommendation

Implementation should start with Phase 1 only.

That yields an immediately useful admin backoffice while keeping changes aligned with HumLibreChat's current architecture. Phase 2 and Phase 3 should only begin after the first admin screens and APIs settle cleanly.
