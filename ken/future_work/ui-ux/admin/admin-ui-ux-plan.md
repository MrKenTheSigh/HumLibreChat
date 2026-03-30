# Admin UI/UX Plan

## Summary

The admin backoffice is now functionally broad enough to use, but the UI/UX has mostly grown feature-first.

At this point, the product has:

- admin users
- balances and provisioning
- conversations audit
- plans
- channels
- usage
- roles

The next front-end pass should focus on clarity, consistency, and safer interaction patterns rather than adding new backend capability.

This note is intentionally separate from the numbered admin phases. It is a front-end improvement plan that can be scheduled independently.

## Current State

The current admin UI is usable, but it still has these characteristics:

- many pages are form-heavy and dense
- status and protection rules are not always obvious
- several screens expose low-level data before explaining the action
- some admin actions rely on implicit understanding of system behavior
- feature visibility rules have only recently been normalized, so the UI still needs a consistency pass

In practice, the admin console currently behaves more like an internal tool than a polished product surface.

## Product Goal

The admin console should feel like:

- a coherent control surface
- safe for destructive or sensitive actions
- predictable about what a role, plan, or channel change will affect
- easy to scan without reading implementation details

The goal is not visual novelty. The goal is operational clarity.

## Recommended Approach

Do this as a dedicated front-end workstream in a new thread.

Reasoning:

- the implementation work is now large enough to justify a design-focused pass
- it should not be mixed into the existing backend-heavy thread
- the best next step is to treat it as a UI/UX refinement project with bounded slices

## Main UX Problems To Solve

### 1. Admin Navigation And Orientation

Current issues:

- the left nav is functional but not strongly grouped
- it is not obvious which pages are user management versus system configuration versus audit/reporting
- the admin area still feels like a collection of screens rather than a product surface

Desired outcome:

- clearer grouping
- stronger page descriptions
- more obvious entry and exit paths
- consistent page titles and action hierarchy

Priority pages:

- admin root layout
- admin users
- admin roles
- admin plans
- admin channels
- admin usage

### 2. Users Page And User Detail

Current issues:

- user detail is information-dense
- role, plan, provisioning, and balance all compete for attention
- protected-user rules are easy to miss
- balance and provisioning semantics are not obvious without prior context

Desired outcome:

- clearer section ordering
- stronger emphasis on identity, role, plan, and protection state
- action areas separated from passive information
- explicit warnings for protected admin accounts

Priority areas:

- user identity header
- role assignment card
- balance card
- provisioning card
- plan assignment card

### 3. Roles Management

Current issues:

- permission matrix is correct but visually dense
- it is hard to scan what a role actually grants
- system-role protection is not prominent enough
- there is no compact summary view before editing

Desired outcome:

- high-level summary first
- grouped permissions with better visual hierarchy
- clearer distinction between immutable system roles and editable custom roles
- easier understanding of which permissions affect chat, tools, side panel, and admin surfaces

Priority areas:

- roles list row summary
- permission section grouping
- immutable `ADMIN` treatment
- role create flow

### 4. Plans And Channels

Current issues:

- these are now powerful but concept-heavy
- channels contain provider config, model list, and pricing behavior
- plans now affect model access, but the UI still needs clearer mental models
- some forms still expose system structure more directly than a product admin would expect

Desired outcome:

- clearer explanation of what a channel is
- clearer explanation of what a plan actually grants
- better distinction between connection settings, model settings, and pricing settings
- less cognitive load in large forms

Priority areas:

- channel form layout
- model row layout inside channels
- plan form model-entitlement selection
- empty states and helper text

### 5. Usage And Audit Screens

Current issues:

- tables are useful but still read like raw admin data
- not enough emphasis on the “why” of the numbers
- some labels are too implementation-oriented

Desired outcome:

- summary-first layout
- clearer filters
- more readable transaction semantics
- easier movement between summary and raw records

Priority areas:

- usage summary cards
- transactions table labels
- conversation audit detail layout

## Recommended Work Batches

### Batch 1: Navigation And Information Architecture

Scope:

- admin layout
- section grouping
- page headers
- descriptions
- safe navigation affordances

Why first:

- it improves the whole surface at once
- it reduces friction before touching individual pages

### Batch 2: High-Frequency Operational Pages

Scope:

- admin users
- admin roles
- admin plans

Why second:

- these are the most important day-to-day admin workflows
- they currently carry the highest cognitive load

### Batch 3: System Configuration And Audit Pages

Scope:

- admin channels
- admin usage
- admin conversations

Why third:

- these screens benefit from a stronger system metaphor after the earlier information-architecture pass is in place

## Suggested Execution Model

Recommended workflow:

1. keep planning in the current thread
2. open a new thread for front-end execution
3. implement batch by batch
4. review each batch visually before continuing

This is preferable to doing the UI work in the current thread because the current thread already mixes:

- backend architecture changes
- runtime config work
- role and permission work
- admin feature delivery

Separating the UI pass will make implementation and review substantially cleaner.

## Minimum Deliverable For The First UI Thread

If only one batch is done first, it should be:

- admin layout cleanup
- users page cleanup
- roles page cleanup

That would produce the biggest immediate UX improvement with the least dependency on deeper product redesign.
