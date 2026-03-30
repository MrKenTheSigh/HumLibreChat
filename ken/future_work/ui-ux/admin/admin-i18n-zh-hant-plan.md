# Admin Console i18n Plan

## Goal

Support `en` and `zh-Hant` for the current Admin Console work without changing routes, API contracts, or permission semantics.

## Current State

- `client/src/locales/en/translation.json` is the source of truth for the current Admin Console copy.
- `client/src/locales/zh-Hant/translation.json` already exists, but Admin Console coverage is almost entirely missing.
- The current result is mixed-language UI, especially across:
  - admin shell / navigation
  - users / roles / plans / channels / conversations / usage
  - modal headers, empty states, confirmations, and pagination copy

## Constraints

- Work in small batches to reduce JSON-edit risk and review overhead.
- Only update `en` when a missing source key is discovered during implementation.
- Add Traditional Chinese only to `client/src/locales/zh-Hant/translation.json`.
- Prefer consistency with existing product wording over literal translation.

## Execution Batches

### Batch 1

Scope:

- admin shell / navigation
- shared admin labels and status words
- shared admin empty states
- shared admin confirmations
- shared admin pagination / date / metadata labels

Purpose:

- Remove the most visible mixed-language chrome first.
- Stabilize wording reused across multiple admin surfaces.

### Batch 2

Scope:

- Users
- Roles

Purpose:

- Cover the most actively iterated pages first.
- Resolve modal, list, and protection-state wording together.

### Batch 3

Scope:

- Plans
- Channels

Purpose:

- Translate the newly modal-driven access-management surfaces as one group.

### Batch 4

Scope:

- Conversations
- Usage

Purpose:

- Finish audit surfaces after shared wording has been established.

### Batch 5

Scope:

- verification

Checks:

- Compare `com_ui_admin_*` keys between `en` and `zh-Hant`
- Confirm no missing Admin Console keys remain
- Run formatting check on touched locale files

## Review Rules

- Prefer concise Traditional Chinese suitable for operational admin UI.
- Avoid mixing English nouns unless they are intentional product terms.
- Keep repeated terms consistent:
  - `Users` -> `使用者`
  - `Roles` -> `角色`
  - `Plans` -> `方案`
  - `Channels` -> `通道`
  - `Conversations` -> `對話`
  - `Usage` -> `用量`
- Treat destructive confirmations and protected-account wording carefully; these should remain explicit and unambiguous.
