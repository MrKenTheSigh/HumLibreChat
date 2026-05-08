# Project Overview

LibreChat is a monorepo with the following key workspaces:

| Workspace | Language | Side | Dependency | Purpose |
|---|---|---|---|---|
| `/api` | JS (legacy) | Backend | `packages/api`, `packages/data-schemas`, `packages/data-provider`, `@librechat/agents` | Express server. Minimize changes here. |
| `/packages/api` | TypeScript | Backend | `packages/data-schemas`, `packages/data-provider` | New backend code lives here. |
| `/packages/data-schemas` | TypeScript | Backend | `packages/data-provider` | Database models/schemas, shareable across backend projects. |
| `/packages/data-provider` | TypeScript | Shared | - | Shared API types, endpoints, data-service used by both frontend and backend. |
| `/client` | TypeScript/React | Frontend | `packages/data-provider`, `packages/client` | Frontend SPA. |
| `/packages/client` | TypeScript | Frontend | `packages/data-provider` | Shared frontend utilities. |

The source code for `@librechat/agents` is at `/home/danny/agentus`.
