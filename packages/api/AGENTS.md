# @librechat/api Agent Instructions

This package is consumed by the backend through the package entry point
`packages/api/dist/index.js`.

## Runtime Build Requirement

- Changes under `packages/api/src/**/*` do not affect the running backend until this
  package is rebuilt.
- After editing `packages/api/src/**/*`, run `npm run build` from `packages/api/`.
- Verify the expected change exists in `packages/api/dist/index.js` when debugging
  runtime behavior loaded through `require('@librechat/api')`.
- Restart the backend after rebuilding so Node loads the updated dist bundle.

## Validation

- Run syntax, lint, or targeted tests relevant to the edited source files before
  considering the task complete.
- If the change is intended to affect runtime logs or behavior, confirm the built
  dist output contains the updated code or text.
