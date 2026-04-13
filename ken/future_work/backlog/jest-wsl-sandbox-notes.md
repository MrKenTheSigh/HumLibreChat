# Jest WSL Sandbox Notes

## Summary

This repo needs an explicit Jest cache location because the default cache path can resolve to the Windows temp directory when running inside WSL.

In this environment, the default Jest cache was resolving to a path like:

- `/mnt/c/Users/KEN/AppData/Local/Temp/jest_rs`

That path caused failures under the Codex sandbox. Setting `cacheDirectory` to a repo-local path made Jest startup deterministic again.

## Current Cache Locations

Jest is now configured to use a workspace-local `.jest-cache` directory in each workspace that has its own Jest config:

- `/home/dev/work/HumLibreChat/api/.jest-cache`
- `/home/dev/work/HumLibreChat/client/.jest-cache`
- `/home/dev/work/HumLibreChat/packages/api/.jest-cache`
- `/home/dev/work/HumLibreChat/packages/client/.jest-cache`
- `/home/dev/work/HumLibreChat/packages/data-provider/.jest-cache`
- `/home/dev/work/HumLibreChat/packages/data-schemas/.jest-cache`

This is controlled by `cacheDirectory: '<rootDir>/.jest-cache'` in each workspace's Jest config.

## Why This Repo Needs It

This repo is affected because:

- development runs inside WSL
- commands may run inside a filesystem sandbox
- environment variables like `TMP`, `TEMP`, and `LOCALAPPDATA` can still point at Windows paths
- Jest uses those paths by default unless `cacheDirectory` is overridden

Observed behavior:

1. Jest startup failed because its cache directory resolved to a Windows temp path inside WSL
2. After fixing the cache path, Jest itself started correctly
3. Backend tests that use `mongodb-memory-server` still required running outside the sandbox, because those tests need to open a local port

So there were two separate issues:

1. Jest cache location
2. Sandbox restrictions for Mongo-backed tests

## When To Reuse This Pattern In Other Repos

Use the same `cacheDirectory` pattern in another repo when any of the following are true:

- the repo runs Jest inside WSL
- the repo is often executed inside a sandboxed environment
- `npx jest --showConfig` reports a cache path under `/mnt/c/.../Temp/...`
- Jest intermittently fails before test execution with temp/cache directory errors

It is usually not necessary when:

- the repo runs entirely in a normal Linux/macOS environment
- Jest already uses a stable local cache path
- there have been no temp-path related failures

## Recommended Default

For monorepos or multi-workspace repos:

- prefer `cacheDirectory: '<rootDir>/.jest-cache'` in each workspace Jest config

For smaller single-workspace repos:

- a single repo-local Jest cache is also acceptable

The workspace-local approach is preferred here because each workspace already owns its own Jest config and test surface.

## Important Sandbox Note

Fixing `cacheDirectory` does **not** make all Jest tests runnable inside the Codex sandbox.

Tests that depend on `mongodb-memory-server` still need the ability to bind a local port. In this repo, that means:

- pure Jest startup problems can be fixed in config
- Mongo-backed tests may still need escalated execution outside the sandbox

A useful way to distinguish the two:

- if Jest fails before running tests and mentions temp/cache paths, check `cacheDirectory`
- if backend tests hang or fail while starting `mongodb-memory-server`, check sandbox port restrictions

## Practical Commands

To inspect where Jest wants to place its cache:

```bash
cd api && npx jest --showConfig
```

To confirm the resolved cache directory:

- look for `cacheDirectory` in the printed config

To verify whether a backend test also depends on local port binding:

```bash
cd api && npx jest models/spendTokens.spec.js --runInBand --watchman=false --verbose
```

If that test still cannot run inside the sandbox after the cache fix, the next suspect is usually `mongodb-memory-server`.

## Maintenance Guidance

- Keep `.jest-cache` out of version control.
- If a new workspace adds Jest later, give it the same `cacheDirectory` treatment.
- When debugging future Jest issues in WSL, check `--showConfig` before changing test code.
