# Code Style

## Structure And Clarity

- Use early returns, flat code, and minimal indentation.
- Break complex operations into well-named helpers.
- Prefer functional style: pure functions, immutable data, and `map`/`filter`/`reduce` where appropriate.
- Use OOP only when it clearly improves domain modeling or state encapsulation.
- Avoid dynamic imports unless absolutely necessary.

## DRY

- Extract repeated logic into utility functions.
- Use reusable hooks and components for UI patterns.
- Prefer parameterized helpers over near-duplicate functions.
- Use constants for repeated values.
- Centralize validators, business rules, and error handling.
- Reuse and extend existing shared types before defining new ones.

## Iteration And Performance

- Minimize looping, especially over shared data structures like message arrays.
- Consolidate sequential O(n) operations into one pass when possible.
- Use `Map`/`Set` for repeated lookups.
- Avoid unnecessary object creation.
- Dispose resources/event listeners and avoid memory leaks.

## Type Safety

- Never use `any`.
- Limit `unknown`, `Record<string, unknown>`, and `as unknown as T`.
- Do not duplicate types. Check `packages/data-provider` first.
- Use explicit parameter, return, and variable types where inference is not sufficient.
- Address TypeScript and ESLint warnings/errors in touched code.

## Comments

- Prefer self-documenting code.
- Use JSDoc only for complex or public APIs where it improves intellisense.
- Avoid standalone comments unless they clarify non-obvious logic.

## Import Order

Imports are organized into three sections:

1. Package imports, sorted shortest to longest line length. `react` always comes first.
2. `import type` imports, sorted longest to shortest. Package types first, then local types.
3. Local/project imports, sorted longest to shortest.

Use standalone `import type { ... }`; do not inline `type` inside value imports.

## Loop Preferences

- Use `for (let i = 0; ...)` for performance-critical or index-dependent operations.
- Use `for...of` for simple array iteration.
- Use `for...in` only for object property enumeration.
