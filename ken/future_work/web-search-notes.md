# LibreChat Web Search Notes

## Summary

Web Search in this repo is not automatically enabled just because a model supports it.

Three things are needed:

1. Web Search must be allowed by interface/permissions
2. A valid `webSearch:` config must exist in `librechat.yaml`
3. The user must enable the feature in the frontend when using chat

## Main Config Location

- [/home/dev/work/HumLibreChat/librechat.yaml](/home/dev/work/HumLibreChat/librechat.yaml)

Repo example:

```yaml
webSearch:
  jinaApiKey: '${JINA_API_KEY}'
  jinaApiUrl: '${JINA_API_URL}'
  cohereApiKey: '${COHERE_API_KEY}'
  serperApiKey: '${SERPER_API_KEY}'
  searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}'
  searxngApiKey: '${SEARXNG_API_KEY}'
  firecrawlApiKey: '${FIRECRAWL_API_KEY}'
  firecrawlApiUrl: '${FIRECRAWL_API_URL}'
```

Relevant schema/config code:

- [/home/dev/work/HumLibreChat/packages/data-provider/src/config.ts](/home/dev/work/HumLibreChat/packages/data-provider/src/config.ts)
- [/home/dev/work/HumLibreChat/packages/data-schemas/src/app/web.ts](/home/dev/work/HumLibreChat/packages/data-schemas/src/app/web.ts)
- [/home/dev/work/HumLibreChat/packages/api/src/web/web.ts](/home/dev/work/HumLibreChat/packages/api/src/web/web.ts)

## Required Service Categories

The implementation expects at least one authenticated service in each category:

- `providers`
- `scrapers`
- `rerankers`

Category mapping from the repo:

- `providers`
  - `serper`
  - `searxng`
- `scrapers`
  - `firecrawl`
  - `serper`
- `rerankers`
  - `jina`
  - `cohere`

This means the three specific keys below are not strictly mandatory:

- `serperApiKey`
- `firecrawlApiKey`
- `jinaApiKey`

But each category still needs one working choice.

## Common Valid Combinations

### Option A

- `serperApiKey`
- `firecrawlApiKey`
- `jinaApiKey`

### Option B

- `searxngInstanceUrl`
- `firecrawlApiKey`
- `jinaApiKey`

### Option C

- `serperApiKey`
- `firecrawlApiKey`
- `cohereApiKey`

## Frontend Behavior

Web Search is not always-on.

Relevant code:

- [/home/dev/work/HumLibreChat/packages/data-provider/src/models.ts](/home/dev/work/HumLibreChat/packages/data-provider/src/models.ts)
- [/home/dev/work/HumLibreChat/packages/data-provider/src/permissions.ts](/home/dev/work/HumLibreChat/packages/data-provider/src/permissions.ts)
- [/home/dev/work/HumLibreChat/packages/api/src/endpoints/openai/llm.ts](/home/dev/work/HumLibreChat/packages/api/src/endpoints/openai/llm.ts)

Behavior:

- The system can expose Web Search as a feature.
- The frontend still treats it as a toggle/capability.
- If the user does not enable it for the chat/request, the model behaves like normal chat and does not automatically search the web.

## Interface / Permissions

Relevant code:

- [/home/dev/work/HumLibreChat/packages/data-provider/src/config.ts](/home/dev/work/HumLibreChat/packages/data-provider/src/config.ts)
- [/home/dev/work/HumLibreChat/packages/data-provider/src/permissions.ts](/home/dev/work/HumLibreChat/packages/data-provider/src/permissions.ts)
- [/home/dev/work/HumLibreChat/packages/api/src/app/permissions.ts](/home/dev/work/HumLibreChat/packages/api/src/app/permissions.ts)

Important points:

- `interface.webSearch` exists and defaults to enabled in config defaults
- `WEB_SEARCH` permissions default to `USE: true`
- In practice, missing provider credentials are the usual reason the feature still does not work

## Operational Notes

- Web Search depends on external search/scrape/rerank services, not just the Azure model
- Even if Azure OpenAI is configured correctly, Web Search still needs its own provider setup
- After changing `librechat.yaml` or related env vars, restart the backend

## Practical Guidance

If the goal is to make Web Search available quickly:

1. add a valid `webSearch:` block to `librechat.yaml`
2. provide the required env vars in `.env`
3. restart the backend
4. enable Web Search from the frontend when chatting
