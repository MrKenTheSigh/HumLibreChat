# Sandbox External MongoDB Scripts

Scripts in this directory are intended to be run outside the Codex sandbox when a
local MongoDB socket is blocked by sandbox networking policy.

Use the fixed runner:

```bash
node ken/scripts/sandbox-external-mongodb/run.js inspect-quota-periods
node ken/scripts/sandbox-external-mongodb/run.js clear-quotas
```

The runner only dispatches named commands from its internal allowlist.
