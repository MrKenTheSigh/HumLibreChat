# Frontend Rules

Read this file when editing `client/src/**/*`.

## Localization

- All user-facing text must use `useLocalize()`.
- Only update English keys in `client/src/locales/en/translation.json`; other languages are automated externally.
- Use semantic key prefixes such as `com_ui_` and `com_assistants_`.

## Components

- Use TypeScript for React components.
- Use proper type imports.
- Use semantic HTML and ARIA labels for accessibility.
- Group related components in feature directories.
- Use index files for clean exports.

## Data Management

- Feature hooks follow this path: `client/src/data-provider/[Feature]/queries.ts` -> `[Feature]/index.ts` -> `client/src/data-provider/index.ts`.
- Use React Query for API interactions.
- Invalidate relevant queries after mutations.
- Use `QueryKeys` and `MutationKeys` from `packages/data-provider/src/keys.ts`.

## Data-Provider Integration

- Endpoints: `packages/data-provider/src/api-endpoints.ts`.
- Data service: `packages/data-provider/src/data-service.ts`.
- Types: `packages/data-provider/src/types/queries.ts`.
- Use `encodeURIComponent` for dynamic URL parameters.

## Performance

- Prioritize memory and speed at scale.
- Use cursor pagination for large datasets.
- Keep dependency arrays correct to avoid unnecessary renders.
- Use React Query caching and background refetching.
