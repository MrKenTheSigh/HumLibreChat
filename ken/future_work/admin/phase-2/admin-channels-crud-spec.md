# Slice Spec: Admin Channels CRUD

## Goal

Add admin-only CRUD for `AdminChannel`.

This slice creates the business-facing channel overlay without altering the underlying provider setup.

## Out Of Scope

- Provider credential management
- User plan assignment
- Runtime chat restriction
- Usage analytics
- Free-form model names outside the validated inventory

## User Story

An admin can define named channels that group one or more valid `endpoint + model` entries into business-facing options.

## Backend API Contract

### Endpoints

`GET /api/admin/channels`

`GET /api/admin/channels/:channelId`

`POST /api/admin/channels`

`PATCH /api/admin/channels/:channelId`

`DELETE /api/admin/channels/:channelId`

### Suggested Create/Update Request Shape

```json
{
  "name": "Azure Premium",
  "slug": "azure-premium",
  "description": "High-capability Azure chat options",
  "enabled": true,
  "sortOrder": 10,
  "icon": "shield",
  "entries": [
    {
      "endpoint": "azureOpenAI",
      "model": "gpt-4o",
      "label": "Azure GPT-4o",
      "enabled": true,
      "defaultSpec": null
    }
  ]
}
```

### Suggested Response Shape

```json
{
  "id": "channel-id",
  "name": "Azure Premium",
  "slug": "azure-premium",
  "description": "High-capability Azure chat options",
  "enabled": true,
  "sortOrder": 10,
  "icon": "shield",
  "entries": [
    {
      "endpoint": "azureOpenAI",
      "model": "gpt-4o",
      "label": "Azure GPT-4o",
      "enabled": true,
      "defaultSpec": null
    }
  ],
  "createdAt": "2026-03-25T00:00:00.000Z",
  "updatedAt": "2026-03-25T00:00:00.000Z"
}
```

### Validation Rules

- `name` required
- `slug` required and unique
- `entries` must contain at least one valid inventory-backed item
- every entry must match a valid row from `GET /api/admin/channel-inventory`
- duplicate `endpoint + model` entries in the same channel should be rejected

### Error Cases

- `400` invalid payload
- `401` unauthenticated
- `403` non-admin
- `404` unknown channel
- `409` duplicate slug

## Data Source

Add new persistent entity:

- `AdminChannel`

Read-only dependency:

- channel inventory API / existing endpoint-model inventory resolution

## Proposed Implementation Files

### Data Schemas

- `packages/data-schemas/src/schema/adminChannel.ts`
- `packages/data-schemas/src/types/adminChannel.ts`
- `packages/data-schemas/src/models/adminChannel.ts`
- `packages/data-schemas/src/schema/index.ts`
- `packages/data-schemas/src/models/index.ts`

### Backend

- `packages/api/src/admin/channels.ts`
- `packages/api/src/admin/channelInventory.ts`
- `packages/api/src/admin/index.ts`
- `api/server/routes/admin/channels.js`
- `api/server/routes/index.js`
- `api/server/index.js`

### Shared Client Data Layer

- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/types/queries.ts`

### Frontend

- `client/src/data-provider/Admin/queries.ts`
- `client/src/data-provider/Admin/mutations.ts`
- `client/src/components/Admin/Channels/AdminChannelsPage.tsx`
- `client/src/components/Admin/Channels/AdminChannelForm.tsx`
- `client/src/components/Admin/index.ts`
- `client/src/routes/Dashboard.tsx`
- `client/src/locales/en/translation.json`

## UI Contract

### Routes

- `/d/admin/channels`
- `/d/admin/channels/new`
- `/d/admin/channels/:channelId`

### List Page

- list of channels
- enabled state
- entry count
- create action

### Form Page

- create and edit modes
- inventory-backed entry picker
- entry ordering and enable toggles
- validation for duplicate or invalid entries
- delete action on edit mode

## Permissions

- Admin only
- Backend validates every entry against the trusted inventory source

## Acceptance Criteria

1. Admin can list channels.
2. Admin can create a channel with one or more valid entries.
3. Admin cannot save a channel with invalid endpoint/model pairs.
4. Admin can edit and delete channels.
5. Duplicate slugs are rejected cleanly.

## Testing Scope

### Backend

- list success
- create success
- invalid inventory entry failure
- duplicate entry failure
- duplicate slug failure

### Frontend

- list render
- inventory-backed form render
- invalid entry handling
- create/edit mutation states

## Cut Line

This slice is done when channels can be managed end to end as overlays over existing model inventory. Do not add runtime routing or provider config changes here.
