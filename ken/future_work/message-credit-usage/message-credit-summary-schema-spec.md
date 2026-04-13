# Message Credit Usage Slice 1: Message Credit Summary Schema

## Goal

Add a stable, user-facing credit summary field to messages so the chat UI can render per-message spend without needing transaction aggregation during normal reads.

## Out Of Scope

- no transaction aggregation helper yet
- no UI rendering
- no usage detail endpoint
- no quota/progress API changes

## Schema Contract

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

## Semantics

- `spentCredits` is always a positive display value
- `status = 'final'` means the value is ready for normal UI display
- `status = 'estimated'` is available for future use but should not be required in the first slice
- `status = 'unavailable'` is optional and should only be used if the product later wants an explicit no-data state

## Data Strategy

This field is a projection, not the accounting source of truth.

- source of truth remains `Transaction`
- `Message.creditUsage` exists for read efficiency and UI clarity

## Files Expected To Change

- `packages/data-schemas/src/types/message.ts`
- `packages/data-schemas/src/schema/message.ts`
- `packages/data-provider/src/schemas.ts`
- `packages/data-provider/src/types.ts` if needed through re-export paths

## Acceptance Criteria

- the message schema supports an optional `creditUsage`
- frontend message types can safely consume `creditUsage`
- existing message reads remain backward compatible for old documents without the field

## Test Scope

- schema/type-level tests only where already customary
- no route tests
- no UI tests

## Cut Line

This slice is done when `Message.creditUsage` is a stable typed field available across backend and frontend message models.
