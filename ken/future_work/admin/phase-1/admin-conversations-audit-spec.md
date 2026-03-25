# Slice Spec: Admin Conversations Audit

## Goal

Add an admin-only conversation audit view that can search all conversations and inspect the full message stream for one conversation.

## Out Of Scope

- Editing or deleting other users' conversations
- Re-running messages
- Global message search across raw message contents
- Usage analytics charts
- Export tools

## User Story

An admin can search across all user conversations, open a specific conversation, and inspect its messages for moderation, support, or troubleshooting purposes.

## Backend API Contract

### Endpoint 1

`GET /api/admin/conversations`

### Query Params

- `cursor`
- `limit`
- `search`
- `userId`
- `endpoint`
- `model`
- `createdAfter`
- `createdBefore`

### Response Shape

```json
{
  "conversations": [
    {
      "conversationId": "string",
      "userId": "string",
      "userEmail": "string|null",
      "title": "string|null",
      "endpoint": "string|null",
      "model": "string|null",
      "createdAt": "2026-03-25T00:00:00.000Z",
      "updatedAt": "2026-03-25T00:00:00.000Z"
    }
  ],
  "nextCursor": "string|null"
}
```

### Endpoint 2

`GET /api/admin/conversations/:conversationId`

Returns the conversation header metadata.

### Endpoint 3

`GET /api/admin/conversations/:conversationId/messages`

### Response Shape

```json
{
  "conversation": {
    "conversationId": "string",
    "userId": "string",
    "userEmail": "string|null",
    "title": "string|null",
    "endpoint": "string|null",
    "model": "string|null"
  },
  "messages": [
    {
      "messageId": "string",
      "parentMessageId": "string|null",
      "isCreatedByUser": true,
      "sender": "string|null",
      "text": "string|null",
      "content": [],
      "createdAt": "2026-03-25T00:00:00.000Z",
      "updatedAt": "2026-03-25T00:00:00.000Z"
    }
  ]
}
```

### Behavior

- Requires authenticated admin.
- Must query conversations without the current user filter used by the standard user routes.
- Message query should be scoped by `conversationId`, not by current admin user id.

## Data Source

Use existing:

- `Conversation`
- `Message`
- `User` for optional email enrichment

No schema changes in this slice.

## Proposed Implementation Files

### Backend

- `packages/api/src/admin/conversations.ts`
- `api/server/routes/admin/conversations.js`
- `api/server/routes/index.js`
- `api/server/index.js`

### Shared Client Data Layer

- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/types/queries.ts`

### Frontend

- `client/src/data-provider/Admin/queries.ts`
- `client/src/components/Admin/Conversations/AdminConversationsPage.tsx`
- `client/src/components/Admin/Conversations/AdminConversationDetail.tsx`
- `client/src/routes/Dashboard.tsx`
- `client/src/locales/en/translation.json`

## UI Contract

### Routes

- `/d/admin/conversations`
- `/d/admin/conversations/:conversationId`

### List Page

- search input
- optional endpoint/model filters
- table with title, user, endpoint, model, updated time
- empty state

### Detail Page

- conversation metadata header
- ordered message timeline
- clear indication of user vs assistant messages
- loading and not-found states

## Permissions

- Admin only on both route and API
- No write actions in this slice

## Acceptance Criteria

1. Admin can list conversations from all users.
2. Admin can filter by user, endpoint, or model.
3. Admin can open one conversation and inspect its messages.
4. Standard non-admin users cannot access the API.
5. Existing user conversation routes remain unchanged.

## Testing Scope

### Backend

- list success
- message detail success
- `403` for non-admin
- not-found conversation
- verify that the admin route is not accidentally scoped to `req.user.id`

### Frontend

- list render
- empty state
- detail render
- not-found state

## Cut Line

This slice is done when the admin can audit one conversation end to end. Do not add delete, redact, export, or moderation actions here.
