# Phase 8 Sensitive Information Policy Plan

## Goal

Add sensitive information detection to chat messages and uploaded files so the system can
record policy-relevant counts and apply configurable actions over a daily time window.

## Scope

- Chat text: detect sensitive information in user-created chat messages.
- Chat file uploads: detect encrypted files during upload, then merge the result into the
  user message that references the file.
- Counts are tracked per sensitive information type. Combination rules are intentionally
  not modeled because cross-type matches can be queried from per-type counts.
- The database stores counts and rule identifiers only. It must not store the matched
  sensitive values again.
- Policy enforcement applies to chat send. `record` and `warn` allow the message to continue;
  `block` stores a blocked message and prevents model execution.

## Sensitive Information Types

- Chinese name
- Credit card number
- Taiwan national ID number
- Mobile phone number
- Landline phone number
- Address
- Email address
- Encrypted file

## Message Data

Each message can include a `sensitiveDetection` object:

- `totalCount`: total detected sensitive information count.
- `ruleMatches`: per-rule count entries.
- `evaluatedAt`: detection timestamp.
- `version`: detector version for future migrations.

Encrypted file detection is first stored in file metadata during upload, then merged into
the user message `sensitiveDetection` when the message is saved.

## Policy Model

Policy decisions are based on the user's accumulated detections inside a configured daily
window. The smallest calculation unit is one day, so common queries are "today",
"last N days", or a specific date range.

Current settings:

- Time window duration in days.
- Per-rule thresholds.
- Action per threshold: none, record, warn, block.

The default policy shape is:

- `record`: 1
- `warn`: 20
- `block`: 50

Future settings can add manager release, audit review, notification channels, and
exception handling.

## Execution Slices

1. Add deterministic text detector and tests. Done.
2. Extend message schema and type with `sensitiveDetection`. Done.
3. Attach detection results when saving user-created chat messages. Done.
4. Add encrypted file detection for uploaded files. Done.
5. Merge encrypted file detections into the saved user message. Done.
6. Add policy settings and action evaluation. Done.
7. Add ActivityLog entries for enabled policy decisions. Done.
8. Add admin summary API for time-window reporting. Done.
9. Add pre-send enforcement for warn/block actions. Done.
10. Add admin UI for settings and search/reporting. Done for summary list, pagination, and
    message drill-down.
11. Persist daily sensitive-information summaries for submitted and blocked messages. Done.
12. Display blocked messages in chat after reload without locking the input. Done.
13. Display warning messages on the chat message itself. Done.
14. Add admin drill-down from sensitive-information summaries into related messages. Done.
15. Scope MANAGER and AUDITOR sensitive-information visibility to their own department subtree. Done.

## Current State

The end-to-end baseline is in place:

- Text detections are recorded on user-created chat messages.
- Encrypted upload detections are recorded in file metadata and merged into message-level counts.
- Blocked messages are persisted with their original content, detection metadata, and
  `finish_reason: sensitive_information_policy_blocked`.
- Blocked messages render in chat as blocked policy messages. Reloading the conversation no
  longer disables the input.
- Warning messages render on the message itself instead of using toast. The current warning text is:
  `已達敏感資訊警告門檻，再 X 次就會被阻擋。`
- The `X` value is calculated from the nearest configured block threshold. If multiple rules
  trigger warnings, the UI shows the smallest remaining count.
- Daily summaries split submitted and blocked counts.
- `GET /api/admin/sensitive-information/summary` returns per-user, per-rule counts for a time window.
- `GET /api/admin/sensitive-information/messages` returns paged related-message details filtered by
  user, rule, outcome, and date range.
- `GET /api/admin/system-settings` includes `sensitiveInformationPolicy`.
- `PATCH /api/admin/system-settings/sensitive-information-policy` updates the backend policy setting.
- The Admin System Settings page can enable the policy, set the rolling window, and edit
  record/warn/block thresholds per sensitive information type.
- When policy settings are enabled, saved user messages with detections are evaluated against the
  configured time window and matching policy decisions are written to ActivityLog.
- Before agent chat generation starts, the backend now evaluates the current message plus uploaded
  encrypted-file detections against historical counts in the policy window. `block` persists a
  blocked user message and stops generation; `record` and `warn` write ActivityLog and allow generation.
- The Admin Sensitive Information page shows summary records with paging instead of an arbitrary
  result cap.
- The Admin Sensitive Information page can open message details from either a summary row or an
  individual rule. Details include the original message text, outcome, detected counts, related
  conversation metadata, and cursor paging.
- Sensitive information admin visibility is now role-scoped:
  - ADMIN can see all records.
  - MANAGER and AUDITOR can see only records for users in their own department subtree.
  - Non-ADMIN users without a department scope receive a forbidden response for these admin APIs.

## Remaining Work

### Required Before Formal Completion

1. Add integration tests for chat preflight:
   - record allows generation and records summary.
   - warn allows generation and attaches warning metadata.
   - block persists a blocked message, stops generation, and does not lock input after reload.
2. Add tests for daily summary updates:
   - submitted counts.
   - blocked counts.
   - message update or edit deltas.
3. Add admin API/UI tests for summary pagination, filters, drill-down, and department scoping.
4. Add a rebuild/backfill script for sensitive-information daily summaries so detector or schema
   changes can be repaired without manual database edits.
5. Manually test encrypted file detection coverage:
   - encrypted zip.
   - encrypted 7z.
   - encrypted Office file.
   - encrypted PDF.
   - non-encrypted versions of the same formats.

### Product Follow-Ups

1. Add formal follow-up workflow for blocked or repeated warning cases:
   - manager review.
   - audit review.
   - exception approval.
   - case status and notes.
2. Add notification behavior for warning or block events, if required.
3. Tune detector quality with a fixed test corpus, especially for Chinese names and addresses.
4. Decide whether blocked messages should support user-facing retry/edit affordances beyond normal
   follow-up messages.

### Sensitive Classifier Agent Plan

The deterministic detector remains the first layer and continues to handle clear formats such as
Taiwan national IDs, phone numbers, email addresses, credit cards, and encrypted files.

Add an optional second-layer classifier agent for cases that format rules cannot judge reliably:

1. Run the classifier before sensitive detections are persisted and before policy thresholds are
   evaluated.
2. Trigger it only when deterministic rules are insufficient, such as Chinese names, addresses,
   same-person association, or other non-standard personal data patterns.
3. Require strict structured JSON output with rule code, count, confidence, and a short reason.
4. Store classifier-derived counts as detection metadata with source `agent`; do not store matched
   sensitive values.
5. Merge deterministic and classifier detections into the same message-level `sensitiveDetection`
   object so reporting and policy enforcement stay unified.
6. Add retry, timeout, and fail-open/fail-closed policy settings before making it mandatory.
7. Add an evaluation corpus so future prompt/model changes can be checked against fixed examples.

### Known Constraints

- Existing historical messages are not automatically backfilled.
- Existing historical daily summaries without `departmentId` will not appear for scoped MANAGER or
  AUDITOR views until they are rebuilt/backfilled.
- Older warning messages created before the remaining-to-block metadata was added can only show the
  generic warning text.
- The current policy counts detections, not distinct messages. A single message with multiple matches
  can move the user across thresholds.
