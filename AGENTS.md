# HumLibreChat Agent Instructions

This file is the lightweight entry point for working in this repository. Read only the
additional files that match the task.

## Always Follow

- Prefer `apply_patch` for normal source edits.
- Avoid full-file rewrites for existing source files unless absolutely necessary.
- If a full rewrite is unavoidable, preserve UTF-8 encoding and avoid mojibake.
- For files containing non-ASCII text, use explicit UTF-8 read/write and keep readable literals.
- If editing JavaScript or TypeScript files, run syntax or type validation before finishing.
- Do not consider a task complete when relevant syntax checks fail.

## Read As Needed

- Repository overview: `AGENTS/project-overview.md`
- Workspace ownership and package boundaries: `AGENTS/workspace-boundaries.md`
- General implementation style: `AGENTS/code-style.md`
- Frontend rules for `client/src/**/*`: `AGENTS/frontend.md`
- Testing rules: `AGENTS/testing.md`
- Development commands and runtime details: `AGENTS/development-commands.md`
- Formatting and linting expectations: `AGENTS/formatting.md`

## Routing Guidance

- Backend changes should normally read `AGENTS/workspace-boundaries.md` and `AGENTS/code-style.md`.
- Frontend changes should read `AGENTS/frontend.md` and `AGENTS/code-style.md`.
- Test changes should read `AGENTS/testing.md`.
- Build, dev-server, dependency, or environment work should read `AGENTS/development-commands.md`.
- If a subdirectory has its own `AGENTS.md`, read that local entry point for rules specific to
  that subtree.
