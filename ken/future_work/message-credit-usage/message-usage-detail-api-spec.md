# Message Credit Usage Slice 3: Message Usage Detail API

## Goal

Expose token/accounting details only when a user explicitly inspects a message.

The default chat experience should stay credit-first, while this endpoint provides the underlying breakdown on demand.

## Out Of Scope

- no default message list payload expansion with token detail
- no admin reporting
- no UI implementation in this slice

## API Contract

Route:

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

## Authorization Rules

- the user must own the target conversation/message
- the route must not expose other users’ transactions even if `messageId` is guessed

## Data Sources

- `Message`
- `Transaction`

The route should use `Message` ownership validation first, then load matching transactions.

## Files Expected To Change

- `api/server/routes/messages.js`
- `api/models/Transaction.js`
- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/types/queries.ts`
- `client/src/data-provider/...` only if a typed query hook is added in the same slice

## Behavior Rules

- response `spentCredits` should match the message-level displayed amount
- transactions may include token detail and contextual accounting fields
- the route must fail clearly on unauthorized or missing messages

## Acceptance Criteria

- user can fetch usage detail for their own message
- unauthorized access is rejected
- returned detail is based on real stored transaction data
- no token breakdown appears in the normal message list API

## Test Scope

- route tests
- transaction-query helper tests
- no UI tests

## Cut Line

This slice is done when the product has a user-facing detail endpoint for message accounting without changing the default chat payload contract.
