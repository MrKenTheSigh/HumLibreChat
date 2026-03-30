# Admin UI/UX Guidelines

This document captures the working rules established while rebuilding the `Users` surface. The same rules should be used across the rest of the admin console unless a page has a clear operational reason to diverge.

## Core Principles

- Optimize for scanability first.
- Keep state, action, and reference information visually separate.
- Prefer one working surface over stacked explanation cards.
- Preserve routes, API contracts, and permission semantics.
- Keep all user-facing text in localization.

## Page Structure

- Avoid a redundant page hero when the first working panel already provides the page title and main actions.
- Prefer a compact top workbench that contains:
  - page title and icon
  - help entry point
  - key counts or current state
  - the primary action for the page
- Keep list pages in a stable three-part layout whenever practical:
  - fixed toolbar/workbench
  - scrollable data region
  - fixed pagination/footer controls

## Explanatory Content

- Remove always-visible narrative paragraphs when the operator can already infer the workflow from the controls.
- Move page-level explanations behind a help button or modal.
- Section headers should usually be title-only. Add helper text only when the control semantics are otherwise unclear.

## Naming

- Do not repeat `Admin` inside admin-local page labels unless it distinguishes a real permission or system concept.
- Use one domain term consistently within a page. Do not mix parallel labels like `Users` and `Accounts`.

## States And Protection

- Surface protected or locked states immediately and visually.
- Put destructive or restricted actions near the affected state, not in the same visual treatment as neutral information.
- When a pending change exists, show `current > next` instead of splitting the state across separate blocks.

## Lists

- Rows should lead with the fields that drive admin decisions.
- Secondary metadata should be present but visually quieter.
- Avoid decorative row CTA pills when the whole row already navigates.

## Detail And Form Screens

- Keep the identity header compact.
- Remove repeated explanatory copy under each section.
- Use one consistent action button language per page.
- Prefer modal detail surfaces for drill-down views when preserving the underlying list context improves navigation.

## Formatting

- Standardize admin timestamps as `yyyy-MM-dd HH:mm:ss`.
- Keep loading, empty, error, and locked states visually bounded.

## Controls

- On the same page, comparable actions should use the same button style.
- Reserve stronger danger styling for truly destructive actions.
- Avoid mixing plain text links, bordered buttons, and branded buttons for equivalent operations in the same surface.
