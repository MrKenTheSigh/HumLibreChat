# Admin UI/UX Guidelines

Read this file before changing admin console UI under `client/src/components/Admin/**/*`.
Use these rules unless a page has a clear operational reason to diverge.

## Core Principles

- Optimize for scanability first.
- Keep state, action, and reference information visually separate.
- Prefer one working surface over stacked explanation cards.
- Preserve routes, API contracts, and permission semantics.
- Keep all user-facing text in localization.

## Page Structure

- Avoid a redundant page hero when the first working panel already provides the page title and main actions.
- Prefer a compact top workbench that contains page title, help entry point, key counts or current state, and the primary page action.
- Keep the top panel focused on search/filter controls and primary action buttons such as create. Add only compact summary metrics when they directly support the list workflow.
- Keep the lower area as the data list or table.
- Data lists must include pagination controls.
- Keep list pages in a stable three-part layout whenever practical: fixed toolbar/workbench, scrollable data region, and fixed pagination/footer controls.

## Explanatory Content

- Remove always-visible narrative paragraphs when the operator can already infer the workflow from the controls.
- Move page-level explanations behind a help button or modal.
- Use the shared `AdminHelpButton` for page-level help when it fits the interaction.
- Prefer structured help content over a single long paragraph when there are multiple concepts.
- For structured help, use short sections with clear labels and familiar icons that match the explained action or mode.
- Section headers should usually be title-only.
- Add helper text only when control semantics are otherwise unclear.

## Naming

- Do not repeat `Admin` inside admin-local page labels unless it distinguishes a real permission or system concept.
- Use one domain term consistently within a page.
- Do not mix parallel labels like `Users` and `Accounts`.

## States And Protection

- Surface protected or locked states immediately and visually.
- Put destructive or restricted actions near the affected state.
- Do not give destructive or restricted actions the same visual treatment as neutral information.
- When a pending change exists, show `current > next` instead of splitting the state across separate blocks.

## Lists

- Rows should lead with fields that drive admin decisions.
- Secondary metadata should be present but visually quieter.
- Avoid decorative row CTA pills when the whole row already navigates.

## Detail And Form Screens

- Keep identity headers compact.
- Remove repeated explanatory copy under each section.
- Use one consistent action button language per page.
- Run create, edit, and similar data-changing form flows in a modal instead of placing editing forms inline above the list.
- Modal form fields must have visible labels. Do not rely on placeholder text as the only field description.
- Modal form actions should use the `Create User` pattern: place actions at the bottom of the form, put the primary submit/action button first, and keep cancel as a secondary button in that same bottom action row rather than in the header.
- Keep the standard close `X` affordance in the modal header when matching existing admin modals. This is separate from the bottom-row `Cancel` action.
- Prefer modal detail surfaces for drill-down views when preserving the underlying list context improves navigation.

## Formatting

- Standardize admin date display as `yyyy/MM/dd`.
- Use `yyyy/MM/dd HH:mm:ss` when time is needed.
- Keep loading, empty, error, and locked states visually bounded.

## Controls

- On the same page, comparable actions should use the same button style.
- Reserve stronger danger styling for truly destructive actions.
- Avoid mixing plain text links, bordered buttons, and branded buttons for equivalent operations in the same surface.
- Admin date and datetime inputs should use the shared admin date picker pattern already used by Manager Reviews and Activity Logs.
- Do not introduce native browser date inputs or a page-local picker unless there is a clear reason to diverge.
