# HumLibreChat Admin Backoffice Implementation Plan

This directory is the entry point for the HumLibreChat admin backoffice planning set.

## Phase Directories

- `phase-1/`: admin foundation, users, balance actions, and conversation audit
- `phase-2/`: plans and channel overlay on top of existing endpoint/model config
- `phase-3/`: access enforcement and user entitlements
- `phase-4/`: usage reporting based on existing transaction data

## Locked Decisions

- Preserve HumLibreChat's current architecture.
- Do not replace the existing YAML-driven endpoint/model system.
- Keep quota/billing on HumLibreChat's existing global `Balance.tokenCredits`.
- Build the admin backoffice inside the existing `client` app.
- Prefer `SystemRoles.ADMIN` as the first access gate. Do not introduce a second large RBAC system in the first pass.

## Target Outcomes

The target is to add an admin-only area that can do the following:

1. Manage all users.
2. Adjust balances and issue temporary bans.
3. Assign plans that limit which models/channels a user can use.
4. Define admin-managed channels without changing the underlying provider architecture.
5. Search and inspect all conversations and messages.
6. View usage from existing transaction data.

## Architecture Direction

The safest path is to add an admin layer on top of HumLibreChat's current primitives instead of replacing them.

- Provider setup remains in `librechat.yaml` and existing endpoint initialization.
- Admin "channels" are metadata overlays over existing `endpoint + model` combinations.
- Balance remains the source of truth for remaining credits.
- Admin APIs live in `/api/admin/*`, but their implementation should live in `packages/api/src/admin/*`.
- New persistent entities live in `packages/data-schemas`.
- Client-side admin pages live under `client/src/routes` and `client/src/components/Admin`.

## Proposed Domain Model

### 1. AdminChannel

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

- `AdminChannel` references models that already exist in HumLibreChat's configured endpoint/model inventory.
- It does not store API keys, instance names, or deployment secrets.

### 2. AdminPlan

Purpose: define which channels/models a user may access.

Suggested fields:

- `name`
- `slug`
- `description`
- `enabled`
- `isDefault`
- `sortOrder`
- `channelIds`
- `notes`
- optional `startingCredits`

Key rule:

- `startingCredits` is a helper for provisioning, not a new quota engine.
- Actual remaining usage still comes from `Balance.tokenCredits`.

### 3. User Extension

Extend the existing user document with:

- `adminPlanId`
- `adminPlanAssignedAt`

Do not add a permanent banned flag in MongoDB for the first pass.

- Existing temporary ban flow is cache-based already.
- Admin ban/unban APIs should reuse that behavior.

### 4. Usage Reporting

Initial implementation should use existing `Transaction` records.

- No new usage ledger in the first phase.
- If reporting proves insufficient later, add a summary collection after the admin surface is already working.

## Phase Plan

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

## Phase 4: Usage Reporting

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
- `src/admin/usage.ts`

### `api/server/routes/admin`

- `users.js`
- `balance.js`
- `conversations.js`
- `plans.js`
- `channels.js`
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
6. Usage dashboard.

## Why This Order

- It gives usable admin value early.
- It avoids touching the model execution path until the admin data model is stable.
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
