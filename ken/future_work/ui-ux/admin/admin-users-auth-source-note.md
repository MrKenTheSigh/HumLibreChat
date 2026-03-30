# Admin Users Auth Source Note

## Context

The `provider` filter was removed from the Admin `Users` page UI during the admin-console UX cleanup.

## Why It Was Removed

- The current product does not model a user as being assigned to a runtime/model provider.
- In the codebase, `provider` on admin users currently means the account's authentication source, such as `local`, `google`, `openid`, or `ldap`.
- In the `Users` page context, the label `Provider` is easy to misread as an AI/model-provider binding, which is not the current behavior.
- The previous filter options were also incomplete relative to the providers present in the codebase.

## Follow-up

If this capability should return later, it should be reintroduced as an auth-oriented concept, for example:

- `Auth Source`
- `Sign-in Method`
- `Identity Provider`

Before restoring it to the primary `Users` toolbar, confirm:

- whether admins actually need it for routine user triage
- whether all supported auth sources are represented
- whether it belongs in the default toolbar or only in advanced filters
