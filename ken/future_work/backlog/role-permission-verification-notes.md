# Role Permission Verification Notes

## Summary

The current role system now controls more of the product surface, but it still needs a broader verification pass.

This work is intentionally not assigned to a specific admin phase yet. It should stay in backlog until there is time to do a systematic end-to-end review.

## Why This Needs Follow-Up

Recent work focused on making role-managed permissions functional and ensuring admin-managed role settings take precedence over `.env` and `librechat.yaml`.

That work fixed specific issues, but it did not yet complete a full verification sweep across every affected UI path and backend gate.

## Verification Goals

The future verification pass should confirm:

- each role-managed feature hides and shows the correct UI
- route-level access matches the configured role permissions
- control panel item visibility matches the underlying feature behavior
- chat input controls and toggles follow role permissions
- backend API gates still enforce the same permissions when UI is bypassed
- role edits persist correctly across backend restarts
- admin-managed role settings continue to win over `.env` and `librechat.yaml`

## Priority Areas

- `CHAT`
- `PARAMETERS`
- `FILE_UPLOADS`
- `PROMPTS`
- `AGENTS`
- `MEMORIES`
- `BOOKMARKS`
- `MULTI_CONVO`
- `TEMPORARY_CHAT`
- `RUN_CODE`
- `WEB_SEARCH`
- `FILE_SEARCH`
- `FILE_CITATIONS`
- `MCP_SERVERS`
- `REMOTE_AGENTS`
- `MARKETPLACE`

## Specific Follow-Up Questions

### Control Panel vs Panel Behavior

Some features now use role permissions to control whether a right-side control panel item is visible.

This still needs a deeper pass to verify whether:

- the panel content also behaves consistently once opened
- empty-state behavior is sensible
- builder or runtime availability rules conflict with role-based visibility

Priority examples:

- `AGENTS`
- `MCP_SERVERS`

### Restart Persistence

Role changes should survive backend restarts without being reverted by:

- interface sync
- system default seeding
- stale role cache

### Config Precedence

Role-managed permissions should not be silently overridden by:

- `.env`
- `librechat.yaml`

This needs continued spot checks whenever new permission types are introduced.
