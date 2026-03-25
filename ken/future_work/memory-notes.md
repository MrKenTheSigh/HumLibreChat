# LibreChat Memory Notes

## Summary

This repo has two different kinds of "memory":

1. Conversation context memory
2. Personalization memories

They are controlled in different places.

## 1. Conversation Context Memory

This is the short-term memory used during a chat reply. It controls how much prior conversation is included in the model request.

Primary control:

- `maxContextTokens`

Relevant code:

- [/home/dev/work/HumLibreChat/packages/data-provider/src/parameterSettings.ts](/home/dev/work/HumLibreChat/packages/data-provider/src/parameterSettings.ts)
- [/home/dev/work/HumLibreChat/packages/data-provider/src/schemas.ts](/home/dev/work/HumLibreChat/packages/data-provider/src/schemas.ts)
- [/home/dev/work/HumLibreChat/api/app/clients/BaseClient.js](/home/dev/work/HumLibreChat/api/app/clients/BaseClient.js)

Behavior:

- Larger `maxContextTokens` lets the model keep more prior messages in context.
- If the token budget is exceeded, older messages are dropped.
- When summarization is enabled in the client flow, LibreChat can compress older context into a summary before continuing.

Key implementation details:

- Context fitting logic: [/home/dev/work/HumLibreChat/api/app/clients/BaseClient.js](/home/dev/work/HumLibreChat/api/app/clients/BaseClient.js)
- Summary reuse and regeneration: [/home/dev/work/HumLibreChat/api/app/clients/BaseClient.js](/home/dev/work/HumLibreChat/api/app/clients/BaseClient.js)

## 2. Personalization Memories

This is long-term saved user memory, separate from normal chat history.

Primary config location:

- [/home/dev/work/HumLibreChat/librechat.yaml](/home/dev/work/HumLibreChat/librechat.yaml)

Example block from the repo comments:

```yaml
memory:
  disabled: false
  validKeys: ["preferences", "work_info", "personal_info", "skills", "interests", "context"]
  tokenLimit: 10000
  personalize: true
  agent:
    provider: "openai"
    model: "gpt-4o-mini"
    instructions: "You are a memory management assistant. Store and manage user information accurately."
```

Relevant schema/config code:

- [/home/dev/work/HumLibreChat/packages/data-provider/src/config.ts](/home/dev/work/HumLibreChat/packages/data-provider/src/config.ts)
- [/home/dev/work/HumLibreChat/packages/api/src/memory/config.ts](/home/dev/work/HumLibreChat/packages/api/src/memory/config.ts)
- [/home/dev/work/HumLibreChat/packages/data-schemas/src/app/memory.ts](/home/dev/work/HumLibreChat/packages/data-schemas/src/app/memory.ts)

Important settings:

- `disabled`: turns the memory system off
- `personalize`: controls whether the Personalization UI is shown
- `validKeys`: restricts allowed memory categories
- `tokenLimit`: total memory storage budget
- `charLimit`: max characters per memory entry
- `messageWindowSize`: how many recent messages are inspected when extracting memory
- `agent`: the agent/model used to read chat and update memories

## Memory Agent Behavior

Relevant code:

- [/home/dev/work/HumLibreChat/api/server/controllers/agents/client.js](/home/dev/work/HumLibreChat/api/server/controllers/agents/client.js)
- [/home/dev/work/HumLibreChat/packages/api/src/agents/memory.ts](/home/dev/work/HumLibreChat/packages/api/src/agents/memory.ts)

Behavior:

- The memory agent processes only a recent window of messages.
- Default `messageWindowSize` is `5`.
- If more messages are present, the system tries to select a recent slice starting from a user message.

## Memory Limits

Relevant code:

- [/home/dev/work/HumLibreChat/api/server/routes/memories.js](/home/dev/work/HumLibreChat/api/server/routes/memories.js)
- [/home/dev/work/HumLibreChat/packages/data-schemas/src/schema/memory.ts](/home/dev/work/HumLibreChat/packages/data-schemas/src/schema/memory.ts)

Behavior:

- `charLimit` is enforced on submitted memory values.
- `tokenLimit` is enforced against total stored memory tokens.
- Memory usage is surfaced in the UI with total tokens and usage percentage.

## UI / Permissions

Relevant code:

- [/home/dev/work/HumLibreChat/client/src/components/SidePanel/Memories/MemoryPanel.tsx](/home/dev/work/HumLibreChat/client/src/components/SidePanel/Memories/MemoryPanel.tsx)
- [/home/dev/work/HumLibreChat/client/src/hooks/usePersonalizationAccess.ts](/home/dev/work/HumLibreChat/client/src/hooks/usePersonalizationAccess.ts)
- [/home/dev/work/HumLibreChat/packages/api/src/app/permissions.ts](/home/dev/work/HumLibreChat/packages/api/src/app/permissions.ts)

Behavior:

- Users can see and manage memories through the Personalization / Memories UI when enabled.
- Users may also get an opt-out toggle depending on memory permissions and `personalize` config.

## Practical Guidance

If the goal is "remember more of the current conversation":

- adjust `maxContextTokens`

If the goal is "remember user preferences or durable facts across chats":

- configure the `memory:` block in `librechat.yaml`
- choose a memory agent
- tune `messageWindowSize`, `tokenLimit`, and `charLimit`
