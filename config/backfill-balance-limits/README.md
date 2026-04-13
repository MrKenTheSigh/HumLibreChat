# Balance Limit Backfill

This directory contains the one-off backfill script used to populate the new balance limit fields for existing users.

## Purpose

The balance model now stores:

- `tokenCredits`: current remaining credits
- `tokenCreditsLimit`: current total credit limit
- `planTokenCredits`: remaining credits that still belong to the assigned plan
- `planTokenCreditsLimit`: the limit contributed by the assigned plan

Older records may only have `tokenCredits`. This script fills in the missing fields so quota calculations can read directly from `Balance`.

## Command

Run from the repository root:

```bash
npm run backfill-balance-limits -- --dry-run
```

## Options

- `--dry-run`
  Prints the changes that would be written, without updating the database.
- `--force`
  Recomputes and overwrites the balance limit fields even if they already exist.
- `--email=<email>`
  Restricts the run to one user by email.
- `--user-id=<id>`
  Restricts the run to one user by Mongo ObjectId.
- `--limit=<n>`
  Limits how many balance records are scanned in this run.

## Examples

```bash
npm run backfill-balance-limits -- --dry-run
npm run backfill-balance-limits -- --email=user@example.com
npm run backfill-balance-limits -- --user-id=66123456789abcdef012345
npm run backfill-balance-limits -- --dry-run --limit=20
npm run backfill-balance-limits -- --force
```

## Backfill Rules

The script is intentionally conservative and only uses current `Balance`, `User.adminPlanId`, and `AdminPlan.startingCredits`.

- If the user has no plan:
  - `planTokenCredits = 0`
  - `planTokenCreditsLimit = 0`
  - `tokenCreditsLimit = tokenCredits`
- If the user has a plan:
  - `planTokenCreditsLimit = startingCredits`
  - `planTokenCredits = min(tokenCredits, startingCredits)`
  - `tokenCreditsLimit = max(tokenCredits, startingCredits)`

This means the script does not reconstruct historical spending or historical manual credit additions. It creates a safe starting state for the new balance fields from the data that currently exists.

## Safety

- By default, records that already have all three new fields are skipped.
- Use `--force` only when you intentionally want to recalculate existing values.
- The script never changes `tokenCredits` to a different remaining value than the one already stored, except to normalize invalid negative values to `0`.

## Recommended Rollout

1. Run a dry run against all users.
2. Run a dry run against one or two known users and inspect the output.
3. Execute the real write.
4. Verify a few users in the admin UI or directly in MongoDB.
