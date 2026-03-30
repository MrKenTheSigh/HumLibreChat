# zh-Hant Localization Fallback Note

## Problem

The current Traditional Chinese locale in `client/src/locales/zh-Hant/translation.json` is still missing many keys relative to English.

When a `zh-Hant` key is missing, the UI falls back to another locale or default string. In practice, this causes mixed-language output in the product, including:

- English fallback text
- Simplified Chinese fallback text
- Inconsistent Traditional Chinese terminology across adjacent UI surfaces

## Confirmed Examples

- Chat right-side memory panel showed:
  - `No memories yet`
  - `暂无记忆，请手动创建或提示 AI 记住一些内容`
- Chat tools > Web Search > Jina API URL placeholder showed Simplified Chinese-style optional text.

These specific examples were fixed locally once the missing `zh-Hant` keys were added, but they confirm a broader coverage gap rather than an isolated rendering bug.

## Root Cause

This is not primarily a hard-coded Simplified Chinese issue in components.

The main cause is incomplete `zh-Hant` key coverage. As long as `zh-Hant` remains significantly behind `en`, more fallback cases will continue to appear across chat, side panels, tools, settings, and future surfaces.

## Follow-up Work

- Audit `zh-Hant` against `en` and generate a reliable missing-key list.
- Fill missing high-traffic shared UI keys first:
  - chat
  - memories
  - tools
  - web search
  - side panels
  - settings
- Run a second pass for terminology consistency in `zh-Hant`, especially Taiwan-facing wording.
- Verify that fallback behavior no longer surfaces English or Simplified Chinese in normal `zh-Hant` flows.

## Notes

- The repo currently uses `zh-Hant`, not `zh-TW`, as the Traditional Chinese locale target.
- This work should be treated as cross-surface localization cleanup, not as an Admin Console-only task.
