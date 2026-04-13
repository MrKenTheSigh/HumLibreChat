# Message Credit Usage Slice 5: Chat Credit UI

## Goal

Render user-facing credit consumption in the chat experience using the new message summary and quota summary data.

## Out Of Scope

- no pricing explanation screens
- no admin usage dashboard work
- no full-page transaction history

## UX Contract

The default user should be able to answer these questions without understanding token math:

- how much did this assistant reply cost me
- how much credit do I have left this period
- am I approaching my limit

The default chat UI should not force the user to parse prompt/completion/cache categories.

## Suggested UI Sections

### Per-message spend badge

Component:

- `client/src/components/Chat/Messages/MessageCreditUsage.tsx`

Default rendering:

- `消耗 320 credits`

Rules:

- show only on assistant messages
- render nothing if `creditUsage` is absent
- support a future or same-slice detail affordance that loads usage detail on demand

Suggested mount point:

- `client/src/components/Chat/Messages/ui/MessageRender.tsx`
- inside `SubRow`
- after `SiblingSwitch`
- before `HoverButtons`

### Account quota bar

Component:

- `client/src/components/Nav/QuotaBar.tsx`

Default rendering:

- primary label: `剩餘 37.6k / 50k credits`
- secondary label: `已使用 12.4k`

Suggested mount point:

- `client/src/components/Nav/AccountSettings.tsx`

## Behavior Rules

- default chat UI shows only credits, not token categories
- token detail should appear only when the user explicitly requests message usage details
- quota bar should visually emphasize throttling as remaining credit decreases

Suggested threshold styling:

- remaining > 50%: neutral
- remaining 20% to 50%: caution
- remaining < 20%: warning
- remaining < 10%: strong warning

## Files Expected To Change

- `client/src/components/Chat/Messages/ui/MessageRender.tsx`
- `client/src/components/Chat/Messages/MessageCreditUsage.tsx`
- `client/src/components/Nav/AccountSettings.tsx`
- `client/src/components/Nav/QuotaBar.tsx`
- `client/src/locales/en/translation.json`
- possibly client query hooks for detail loading

## Acceptance Criteria

- assistant messages can show a credit spend badge from message data alone
- account settings can show a current-period quota/progress bar
- the user does not need to understand token accounting to interpret the main UI
- token detail is only fetched and displayed on demand

## Test Scope

- focused component rendering tests
- low-credit threshold state tests
- explicit detail-loading interaction tests if detail UI lands in this slice

## Cut Line

This slice is done when the default chat experience is clearly credit-first for both per-message spend and current-period quota visibility.
