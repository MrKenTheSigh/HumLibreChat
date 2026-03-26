# Slice Spec: Admin Channel Inventory

## Goal

Expose a read-only admin inventory of valid `endpoint + model` combinations that already exist in HumLibreChat.

This slice provides the trusted source that later channel CRUD uses for selection and validation.

## Out Of Scope

- Creating channels
- Persisting inventory snapshots
- Editing endpoint config
- Editing `librechat.yaml`
- Chat runtime enforcement

## User Story

An admin can open the admin channel workflow and select only from valid endpoint/model combinations that HumLibreChat already supports.

## Backend API Contract

### Endpoint

`GET /api/admin/channel-inventory`

### Behavior

- Requires authenticated admin.
- Resolves inventory from the current app configuration and model inventory already exposed by HumLibreChat.
- Returns normalized endpoint/model entries suitable for admin forms.
- Excludes entries that are disabled or unresolved.

### Suggested Response Shape

```json
{
  "inventory": [
    {
      "endpoint": "azureOpenAI",
      "model": "gpt-4o",
      "label": "azureOpenAI / gpt-4o",
      "defaultParameters": null
    },
    {
      "endpoint": "azureOpenAI",
      "model": "gpt-4o-mini",
      "label": "azureOpenAI / gpt-4o-mini",
      "defaultParameters": null
    }
  ]
}
```

### Error Cases

- `401` unauthenticated
- `403` non-admin
- `500` configuration resolution failure

## Data Source

Use existing app configuration and endpoint/model inventory:

- current startup/app config services
- existing endpoint/model resolution logic

No new Mongo collections in this slice.

## Proposed Implementation Files

### Backend

- `packages/api/src/admin/channelInventory.ts`
- `packages/api/src/admin/index.ts`
- `api/server/routes/admin/channelInventory.js`
- `api/server/routes/index.js`
- `api/server/index.js`

### Shared Client Data Layer

- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/types/queries.ts`

### Frontend

- `client/src/data-provider/Admin/queries.ts`
- `client/src/data-provider/Admin/index.ts`

## UI Contract

### Usage Pattern

This slice does not require a standalone page.

It exists to support:

- channel create form
- channel edit form
- optional inventory preview in the admin channels screen

### Required Client Behavior

- fetch inventory on demand for admin channel forms
- provide stable loading and error states
- preserve endpoint/model labels exactly as returned by the backend

## Permissions

- Admin only
- Backend remains the source of truth for what counts as valid inventory

## Acceptance Criteria

1. Admin can fetch a normalized inventory list of valid endpoint/model combinations.
2. Non-admin requests return `403`.
3. Inventory output is stable enough to drive select controls in the client.
4. The slice does not introduce a second source of truth for endpoint/model config.

## Testing Scope

### Backend

- success case with multiple endpoints/models
- `403` for non-admin route wrapper
- empty inventory case
- invalid or missing config handling

### Frontend

- query success state
- loading state
- error state

## Cut Line

This slice is done when later channel CRUD work can rely on a single admin inventory API. Do not add channel persistence or page-level CRUD behavior here.
