# Workspace Boundaries

- All new backend code must be TypeScript in `/packages/api`.
- Keep `/api` changes to the absolute minimum. Use thin JS wrappers calling into `/packages/api`.
- Database-specific shared logic goes in `/packages/data-schemas`.
- Frontend/backend shared API logic goes in `/packages/data-provider`.
- Endpoints: `packages/data-provider/src/api-endpoints.ts`.
- Data service: `packages/data-provider/src/data-service.ts`.
- Shared API types: `packages/data-provider/src/types/queries.ts`.
- Query keys and mutation keys: `packages/data-provider/src/keys.ts`.
- Build data-provider from project root with `npm run build:data-provider`.
