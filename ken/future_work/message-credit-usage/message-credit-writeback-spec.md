# Message Credit Usage Slice 2: Transaction Write-Back To Message

## Goal

Persist a denormalized credit summary onto each assistant message after accounting completes.

This ensures the chat UI can display per-message credit spend directly from the message document.

## Out Of Scope

- no default token detail in message list payloads
- no quota/progress API work
- no historical backfill
- no UI work

## Write-Back Contract

Add a reusable helper, for example:

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

## Aggregation Rule

Suggested first-pass query rule:

- filter by `user`
- filter by `messageId`
- include `tokenType in ('prompt', 'completion')`
- compute `sum(abs(tokenValue))`

Suggested write-back:

```ts
creditUsage = {
  spentCredits: aggregatedPositiveValue,
  status: 'final',
};
```

## Why Aggregate From Transaction

- keeps `Transaction` as the accounting truth
- avoids drift between runtime estimates and actual stored deductions
- naturally handles multi-transaction responses

## Runtime Paths Expected To Change

- `api/app/clients/BaseClient.js`
- `api/server/controllers/agents/client.js`
- `api/server/middleware/abortMiddleware.js`
- `api/server/services/Threads/manage.js`

## Ordering Rule

Preferred write order:

1. persist the response message
2. persist transaction(s)
3. aggregate transaction spend by `messageId`
4. update `Message.creditUsage`

If timing makes this difficult in one path, the helper may retry briefly when the target message is not yet present.

## Edge Cases

- incomplete or aborted responses should still write actual spent credits if spend was recorded
- older flows with missing message metadata should fail soft and not crash the request
- unrelated `credits` transactions such as top-ups must not leak into per-message spend

## Files Expected To Change

- `api/models/Message.js`
- `api/models/Transaction.js`
- `api/app/clients/BaseClient.js`
- `api/server/controllers/agents/client.js`
- `api/server/middleware/abortMiddleware.js`
- `api/server/services/Threads/manage.js`
- possibly a new helper module under `api/models` or `api/server/services`

## Acceptance Criteria

- a newly generated assistant message can receive `creditUsage.spentCredits`
- multiple transactions under the same `messageId` aggregate correctly
- normal chat, agents, abort, and assistants paths all write back consistently
- failures in write-back do not corrupt the main request flow

## Test Scope

- backend helper tests
- targeted path-specific tests for chat, agents, and abort behavior
- no UI tests

## Cut Line

This slice is done when all new assistant responses can persist a direct message-level credit summary derived from stored transactions.
