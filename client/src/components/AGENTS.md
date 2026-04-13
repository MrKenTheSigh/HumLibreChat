# Component Notes

## Chat Message Rendering Split

- Chat message UI is not rendered by a single component path.
- Before changing badges, action rows, model labels, or per-message metadata UI, first check `/home/dev/work/HumLibreChat/client/src/components/Chat/Messages/MultiMessage.tsx`.
- `MultiMessage.tsx` routes message rendering into three branches:
  - `isAssistantsEndpoint(message.endpoint) && message.content` -> `/home/dev/work/HumLibreChat/client/src/components/Chat/Messages/MessageParts.tsx`
  - `message.content` on non-assistants endpoints -> `/home/dev/work/HumLibreChat/client/src/components/Messages/ContentRender.tsx`
  - no `message.content` -> `/home/dev/work/HumLibreChat/client/src/components/Chat/Messages/ui/MessageRender.tsx`

## Practical Rule

- If a chat UI change seems to "not show up", do not assume data flow is broken first.
- Confirm which render branch the target message uses, then patch the matching component path.
- For assistant replies with structured/content-part payloads, the active path is usually `MessageParts.tsx`, not `ui/MessageRender.tsx`.
