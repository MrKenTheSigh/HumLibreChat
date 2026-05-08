# Testing

Read this file when adding or changing tests, test helpers, or behavior that needs verification.

## Commands

- Run Jest from the relevant workspace:
  - `cd api && npx jest <pattern>`
  - `cd packages/api && npx jest <pattern>`
  - `cd client && npx jest <pattern>`
- Frontend tests live in `__tests__` directories alongside components.
- Frontend layout tests should use `test/layout-test-utils`.

## Philosophy

- Prefer real logic over mocks.
- Use spies over mocks when possible.
- Use `mongodb-memory-server` for database tests.
- Use real `@modelcontextprotocol/sdk` exports for MCP tests.
- Mock only external HTTP APIs, rate-limited services, and non-deterministic system calls.
- Heavy mocking is a code smell.
