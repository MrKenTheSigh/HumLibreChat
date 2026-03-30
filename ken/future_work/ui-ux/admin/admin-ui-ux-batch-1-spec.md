# Admin UI/UX Batch 1 Spec

## Summary

Batch 1 is the first dedicated UI/UX refinement pass for the admin console.

This batch should focus on:

- admin layout and navigation clarity
- admin users page and user detail readability
- admin roles page usability

This batch should not introduce new backend capabilities. It should primarily reorganize and clarify the existing front-end experience.

## Goal

Make the admin console easier to understand and safer to operate for the three highest-value surfaces:

- the overall admin shell
- user management
- role management

## Non-Goals

This batch should not include:

- new role permission categories
- deeper permission engine changes
- plan/channel policy redesign
- usage analytics redesign
- conversation audit redesign
- visual polish for every admin page

## Success Criteria

Batch 1 is successful when:

- the admin area feels grouped and intentional instead of screen-by-screen
- user detail is easier to scan without understanding internal implementation
- roles are easier to understand at a glance before editing the full permission matrix
- protected states are obvious
- dangerous or high-impact actions are visually separated from passive information

## Scope

### 1. Admin Shell

Files likely involved:

- [/home/dev/work/HumLibreChat/client/src/components/Admin/AdminView.tsx](/home/dev/work/HumLibreChat/client/src/components/Admin/AdminView.tsx)
- [/home/dev/work/HumLibreChat/client/src/components/Admin/AdminLayout.tsx](/home/dev/work/HumLibreChat/client/src/components/Admin/AdminLayout.tsx)
- [/home/dev/work/HumLibreChat/client/src/routes/Dashboard.tsx](/home/dev/work/HumLibreChat/client/src/routes/Dashboard.tsx)

Required improvements:

- group navigation into clearer categories
- strengthen page headings and descriptions
- make the “back to chat” path obvious
- create more consistent top-level spacing and section rhythm
- avoid a flat wall of cards and tables

Suggested nav grouping:

- `People`
  - Users
  - Roles
- `Access`
  - Plans
  - Channels
- `Audit`
  - Conversations
  - Usage

Notes:

- grouping can be visual only; route structure does not need to change in batch 1
- do not redesign the entire app shell, only the admin surface

### 2. Admin Users List

Files likely involved:

- [/home/dev/work/HumLibreChat/client/src/components/Admin/Users/AdminUsersPage.tsx](/home/dev/work/HumLibreChat/client/src/components/Admin/Users/AdminUsersPage.tsx)
- [/home/dev/work/HumLibreChat/client/src/components/Admin/Users/AdminCreateUserCard.tsx](/home/dev/work/HumLibreChat/client/src/components/Admin/Users/AdminCreateUserCard.tsx)

Required improvements:

- stronger page-level explanation of what can be done here
- clearer separation between filters and actions
- list rows should surface the most important fields first
- role and plan state should be more readable
- protected admin state should be visible from the list, not only inside detail

Suggested priorities in each row:

- name / email
- role
- assigned plan
- account state or protected state
- quick path to detail

Optional if low-cost:

- compact badges for role/plan/protected state

### 3. Admin User Detail

Files likely involved:

- [/home/dev/work/HumLibreChat/client/src/components/Admin/Users/AdminUserDetail.tsx](/home/dev/work/HumLibreChat/client/src/components/Admin/Users/AdminUserRoleCard.tsx)
- [/home/dev/work/HumLibreChat/client/src/components/Admin/Users/AdminUserPlanCard.tsx](/home/dev/work/HumLibreChat/client/src/components/Admin/Users/AdminUserBalanceCard.tsx)
- [/home/dev/work/HumLibreChat/client/src/components/Admin/Users/AdminUserProvisioningCard.tsx](/home/dev/work/HumLibreChat/client/src/components/Admin/Users/AdminUserProvisioningCard.tsx)

Required improvements:

- add a strong identity header
- surface protected-user status prominently
- order sections by operational importance
- reduce the feeling of unrelated cards competing equally for attention

Recommended section order:

1. identity and protection state
2. role assignment
3. plan assignment
4. balance
5. provisioning
6. secondary metadata

Required UI behaviors:

- protected first admin account must be clearly labeled
- disabled actions must explain why
- role and plan changes should feel like deliberate admin actions, not incidental form controls

### 4. Admin Roles Page

Files likely involved:

- [/home/dev/work/HumLibreChat/client/src/components/Admin/Roles/AdminRolesPage.tsx](/home/dev/work/HumLibreChat/client/src/locales/en/translation.json)

Required improvements:

- role list should communicate “system vs custom” and “editable vs locked” more clearly
- permission matrix needs stronger grouping and hierarchy
- `ADMIN` should look intentionally immutable, not merely disabled
- create-role flow should make template choice easier to understand

Suggested layout direction:

- summary row or header for each role
- high-level metadata first
- permission sections visually grouped
- save/delete actions clearly separated from matrix content

Suggested permission grouping:

- `Core Chat`
  - Chat
  - Parameters
  - Attach Files
  - Multi Convo
  - Temporary Chat
- `Content`
  - Prompts
  - Bookmarks
  - Memories
- `Tools`
  - Run Code
  - Web Search
  - File Search
  - File Citations
  - MCP Servers
  - Remote Agents
- `Agents And Sharing`
  - Agents
  - People Picker
  - Marketplace

Notes:

- this grouping can remain front-end only
- no permission semantics need to change in batch 1

## Implementation Constraints

- preserve current routes
- preserve current backend API contracts
- avoid adding new domain concepts
- keep all user-facing text localized
- do not rewrite functioning data flows unless layout changes require it

## Validation Checklist

Before batch 1 is considered complete:

- admin navigation groups are visually clearer
- users page still loads, filters, and navigates correctly
- user detail still supports role/plan/balance/provisioning actions
- roles page still creates, edits, and deletes roles correctly
- `ADMIN` remains visibly locked and non-editable
- first admin user remains visibly protected
- no existing permission controls are lost

## Suggested Execution Order

1. admin shell and navigation
2. users page and user detail
3. roles page

## Suggested New Thread Goal

If this batch is moved into a new implementation thread, the thread goal should be phrased as:

“Improve the admin console UI/UX for layout, users, and roles without changing backend capability.”
