# Message Credit Usage Implementation Plan

## Goal

Make credit consumption visible in the chat UI at the right abstraction level.

The user should immediately understand:

- how many system credits a single assistant message consumed
- how many credits remain in the current period
- how much of the current period quota has already been used

The user should not need to understand prompt/completion/cache token accounting unless they explicitly request details.

## Out Of Scope

- no pricing logic rewrite
- no multiplier table redesign
- no historical backfill in the first rollout
- no transaction ledger redesign
- no modal-heavy warning flow

## Product Decisions

### User-facing unit

The default user-facing unit is `credit`, not `token`.

That means:

- per-message UI shows `credit` consumption
- quota/progress UI shows `credit` totals and remaining balance
- token-level inputs remain hidden behind a details affordance

### Data ownership

- `Transaction` stays the accounting source of truth
- `Message` gets a denormalized `creditUsage` summary for fast rendering
- current-period quota/progress is served as a separate summary projection

This is an intentional projection design:

- accounting detail remains normalized
- chat UI gets cheap first-read access

## Current State Summary

### Message model

The message schema already stores `tokenCount`, but it does not store a user-facing credit summary.

Relevant files:

- [packages/data-schemas/src/schema/message.ts](/home/dev/work/HumLibreChat/packages/data-schemas/src/schema/message.ts:45)
- [api/models/Message.js](/home/dev/work/HumLibreChat/api/models/Message.js:37)

### Transaction model

The transaction schema already stores the fields needed to explain cost:

- `messageId`
- `tokenType`
- `rawAmount`
- `tokenValue`
- `rate`
- `inputTokens`
- `writeTokens`
- `readTokens`

Relevant files:

- [packages/data-schemas/src/schema/transaction.ts](/home/dev/work/HumLibreChat/packages/data-schemas/src/schema/transaction.ts:22)
- [api/models/Transaction.js](/home/dev/work/HumLibreChat/api/models/Transaction.js:58)

### Balance model

The balance model and `/api/balance` expose remaining credits, but not a period summary shaped for a quota/progress bar.

Relevant files:

- [packages/data-schemas/src/schema/balance.ts](/home/dev/work/HumLibreChat/packages/data-schemas/src/schema/balance.ts:11)
- [api/server/controllers/Balance.js](/home/dev/work/HumLibreChat/api/server/controllers/Balance.js:3)
- [packages/data-provider/src/types.ts](/home/dev/work/HumLibreChat/packages/data-provider/src/types.ts:671)

### Frontend rendering points

Per-message secondary metadata is currently rendered in the message sub-row.

Relevant file:

- [client/src/components/Chat/Messages/ui/MessageRender.tsx](/home/dev/work/HumLibreChat/client/src/components/Chat/Messages/ui/MessageRender.tsx:179)

Current account balance is shown in the account popover.

Relevant file:

- [client/src/components/Nav/AccountSettings.tsx](/home/dev/work/HumLibreChat/client/src/components/Nav/AccountSettings.tsx:56)

## Target Architecture

## Message-level summary

Add a compact, user-facing usage summary directly onto assistant messages.

Suggested shape:

```ts
type TMessageCreditUsage = {
  spentCredits: number;
  status: 'final' | 'estimated' | 'unavailable';
};
```

Suggested message addition:

```ts
creditUsage?: TMessageCreditUsage;
```

### Why this belongs on `Message`

- message list rendering should not need a transaction join just to display a badge
- this value is stable after accounting completes
- the chat UI needs a fast first read for throttling awareness

### Scope

- required for assistant messages
- optional or omitted for user messages
- older messages may not have this field and the UI must tolerate that

## Detail-on-demand endpoint

Expose token/accounting detail only when the user explicitly inspects a message.

Suggested route:

- `GET /api/messages/:conversationId/:messageId/usage`

Suggested response:

```ts
type MessageUsageDetail = {
  spentCredits: number;
  transactions: Array<{
    tokenType: 'prompt' | 'completion' | 'credits';
    context: string | null;
    model: string | null;
    rawAmount: number | null;
    tokenValue: number | null;
    rate: number | null;
    inputTokens: number | null;
    writeTokens: number | null;
    readTokens: number | null;
    createdAt: string | null;
  }>;
};
```

### Behavior

- default message payload does not include token breakdown
- details route resolves from `Transaction` by `messageId`
- the route should only expose records the user is authorized to inspect

## Quota summary projection

Extend `/api/balance` with current-period quota summary data.

Suggested response extension:

```ts
type TQuotaSummary = {
  periodTotalCredits: number;
  periodUsedCredits: number;
  periodRemainingCredits: number;
  usageRatio: number;
  resetAt?: string | null;
};
```

Suggested `TBalanceResponse` addition:

```ts
quota?: TQuotaSummary;
```

### Product note

This plan assumes the product already has or will define a canonical current-period credit total.
The progress bar must be driven by that quota definition, not inferred from refill settings.

## Suggested API Contract

### `GET /api/balance`

Keep the existing fields and append:

```ts
type TBalanceResponse = {
  tokenCredits: number;
  autoRefillEnabled: boolean;
  refillIntervalValue?: number;
  refillIntervalUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  lastRefill?: Date;
  refillAmount?: number;
  quota?: {
    periodTotalCredits: number;
    periodUsedCredits: number;
    periodRemainingCredits: number;
    usageRatio: number;
    resetAt?: string | null;
  };
};
```

### `GET /api/messages/:conversationId`

No new route is required for the first-level per-message badge once `Message.creditUsage` exists.
The existing message list route can naturally expose the field.

### `GET /api/messages/:conversationId/:messageId/usage`

Add this route for on-demand inspection of token/accounting detail.

## Write Path Plan

## Helper to update message-level credit usage

Add a small server helper responsible for backfilling the denormalized message summary.

Suggested helper:

```ts
async function updateMessageCreditUsage({
  user,
  messageId,
  status = 'final',
}: {
  user: string;
  messageId: string;
  status?: 'final' | 'estimated' | 'unavailable';
}): Promise<void>
```

### Helper behavior

- query `Transaction` by `user` and `messageId`
- aggregate all deduction transactions relevant to the message
- convert the result into a positive display value
- write back to `Message.creditUsage`

### Storage rule

User-facing `spentCredits` should always be stored as a positive value.

Example:

- transaction `tokenValue = -320`
- message `creditUsage.spentCredits = 320`

This keeps the UI and frontend formatting trivial.

## Aggregation rule

Recommended first-pass aggregation:

- filter by `user`
- filter by `messageId`
- include `tokenType in ('prompt', 'completion')`
- sum `abs(tokenValue)`

This keeps top-up style `credits` transactions out of the per-message display.

If reasoning-related spend is represented under the same message as completion-like deductions, it will still be captured naturally.

## When to write back

Do not compute the display summary at render time.
Write it when spend becomes final enough for the user-facing badge.

Recommended rule:

- after spend has been recorded for the assistant response
- after the response message has been persisted
- for aborted/incomplete responses, still write the actual spent amount if transactions were recorded

## Backend paths expected to change

### Standard chat path

- [api/app/clients/BaseClient.js](/home/dev/work/HumLibreChat/api/app/clients/BaseClient.js:767)

After `recordTokenUsage()` or equivalent spend logic completes for `this.responseMessageId`, call the new helper.

### Agents path

- [api/server/controllers/agents/client.js](/home/dev/work/HumLibreChat/api/server/controllers/agents/client.js:625)

After `recordCollectedUsage()` completes, write the aggregated message credit summary for `this.responseMessageId`.

### Abort path

- [api/server/middleware/abortMiddleware.js](/home/dev/work/HumLibreChat/api/server/middleware/abortMiddleware.js:34)

If partial spending is recorded against the aborted message, the message should still receive a final `creditUsage`.

### Assistants / threads path

- [api/server/services/Threads/manage.js](/home/dev/work/HumLibreChat/api/server/services/Threads/manage.js:497)

This path already records usage, but it must also update the assistant message’s `creditUsage`.

## Read Path Plan

## Message list

The existing route already returns message documents directly:

- [api/server/routes/messages.js](/home/dev/work/HumLibreChat/api/server/routes/messages.js:283)

Once the message schema/type includes `creditUsage`, this route can return it without adding a second query path.

## Detail route

Add a message-specific usage detail route under the existing messages router.

Recommended implementation:

- validate the conversation and message belong to the current user
- query all transactions for the target `messageId`
- sanitize fields for user-facing inspection

## Frontend Plan

## Per-message badge component

Create a dedicated presentational component, for example:

- `client/src/components/Chat/Messages/MessageCreditUsage.tsx`

Suggested props:

```ts
type MessageCreditUsageProps = {
  creditUsage?: {
    spentCredits: number;
    status: 'final' | 'estimated' | 'unavailable';
  };
  messageId: string;
  conversationId?: string;
};
```

### Default rendering

- render only for assistant messages
- render nothing if `creditUsage` is absent
- primary label:
  - `消耗 320 credits`
- if `status === 'estimated'`, use a subtle qualifier:
  - `預估消耗 320 credits`

### Detail affordance

The badge should support a lightweight detail view later:

- hover card on desktop or click popover
- trigger `GET /api/messages/:conversationId/:messageId/usage`
- show prompt/completion/cache breakdown only on demand

## Message badge mount point

Insert the badge into the existing message sub-row.

Relevant file:

- [client/src/components/Chat/Messages/ui/MessageRender.tsx](/home/dev/work/HumLibreChat/client/src/components/Chat/Messages/ui/MessageRender.tsx:179)

Recommended placement:

- inside `SubRow`
- after `SiblingSwitch`
- before `HoverButtons`

This makes the spend signal visible without interfering with the main content flow.

## Quota bar component

Create a reusable account-level component, for example:

- `client/src/components/Nav/QuotaBar.tsx`

Suggested props:

```ts
type QuotaBarProps = {
  periodTotalCredits: number;
  periodUsedCredits: number;
  periodRemainingCredits: number;
  usageRatio: number;
};
```

### Display rules

- primary label: `剩餘 37.6k / 50k credits`
- secondary label: `已使用 12.4k`
- track = total
- filled layer = remaining

### Visual thresholds for throttling

- remaining > 50%: neutral
- remaining 20% to 50%: caution
- remaining < 20%: warning
- remaining < 10%: strong warning

## Quota bar mount point

Primary mount point:

- [client/src/components/Nav/AccountSettings.tsx](/home/dev/work/HumLibreChat/client/src/components/Nav/AccountSettings.tsx:56)

Recommended first pass:

- replace or upgrade the current single-line balance display
- keep the account popover as the initial delivery point

## Files Expected To Change

### Backend

- `api/models/Message.js`
- `api/models/Transaction.js`
- `api/server/routes/messages.js`
- `api/server/controllers/Balance.js`
- `api/app/clients/BaseClient.js`
- `api/server/controllers/agents/client.js`
- `api/server/middleware/abortMiddleware.js`
- `api/server/services/Threads/manage.js`
- possibly a new helper module under `api/models` or `api/server/services`

### Shared schemas / types

- `packages/data-schemas/src/types/message.ts`
- `packages/data-schemas/src/schema/message.ts`
- `packages/data-provider/src/schemas.ts`
- `packages/data-provider/src/types.ts`
- `packages/data-provider/src/types/queries.ts`
- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`

### Frontend

- `client/src/components/Chat/Messages/ui/MessageRender.tsx`
- `client/src/components/Chat/Messages/MessageCreditUsage.tsx`
- `client/src/components/Nav/AccountSettings.tsx`
- `client/src/components/Nav/QuotaBar.tsx`
- `client/src/data-provider/Misc/queries.ts`
- `client/src/locales/en/translation.json`

## Acceptance Criteria

- every newly created assistant message can display a direct credit consumption summary
- users do not need token knowledge to interpret the main UI
- token/prompt/completion/cache detail is available only on explicit inspection
- balance/progress UI shows current-period total, used, and remaining credits
- the system does not require a transaction join during normal message list rendering
- older messages without `creditUsage` do not break the UI

## Test Scope

### Backend

- message credit summary is written after normal response spending
- multiple transactions under one `messageId` aggregate correctly
- aborted messages still get the correct spend summary when applicable
- assistants, agents, and normal chat paths all update `creditUsage`
- detail route only returns records for authorized users
- `/api/balance` includes quota summary with the expected shape

### Frontend

- assistant message renders the credit badge when `creditUsage` exists
- user message does not render the badge
- missing `creditUsage` renders nothing
- quota bar renders correct labels and usage ratio state
- detail UI only loads accounting detail on demand

## Migration / Backfill

No historical backfill is required for v1.

Recommended v1 behavior:

- new messages receive `creditUsage`
- old messages may render without a badge
- the details route may still work for older messages if matching transactions exist

Backfill can be handled later as a separate maintenance task.

## Risks

### Multiple spend records per message

Some flows may write more than one spend record tied to the same message.
The helper must aggregate by `messageId` instead of assuming one transaction per message.

### Legacy path inconsistency

Older assistants/thread flows are less complete in message-level usage metadata.
This is acceptable as long as the new summary is written consistently for newly generated messages.

### Timing and ordering

If transaction creation finishes before the response message is fully persisted, the write-back helper may need a short retry or must be called only after the message save promise resolves.

The preferred implementation is:

- persist message
- persist spend
- update `Message.creditUsage`

## Recommended Delivery Order

1. add `creditUsage` to message schema and types
2. implement a reusable helper to aggregate and write `Message.creditUsage`
3. wire the helper into normal chat, agents, abort, and assistants spend paths
4. extend `/api/balance` with `quota`
5. build the frontend `MessageCreditUsage` component
6. build the frontend `QuotaBar`
7. add the detail route for on-demand usage inspection
8. add the detail affordance in the badge UI

## Cut Line

This work is successful when:

- the chat UI can show a direct `credit` cost per assistant message without re-aggregating transactions on read
- the account UI can show current-period total, used, and remaining credits in a progress bar
- token-level detail remains available, but only through explicit inspection
