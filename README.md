# Toka SDK

> Toka is an open-source cost-control and observability layer for LLM applications.

Toka is a TypeScript-first SDK architecture for completion requests, local cost estimation, and optional response caching. **Phase 1 uses a deterministic `MockProvider`; it does not call OpenAI, Gemini, Anthropic, or any external provider.**

## Installation

```bash
npm install toka-sdk
```

## Quick start

```ts
import { MockProvider, Toka } from 'toka-sdk';

const toka = new Toka(
  { models: ['demo-model'], maxCostPerRequest: 1 },
  undefined,
  new MockProvider(),
);

const result = await toka.complete({
  model: 'demo-model',
  messages: [{ role: 'user', content: 'Hello, Toka!' }],
});

console.log(result.text);
console.log(result.provider); // mock
console.log(result.costSource); // estimated
```

`Toka.complete()` is the primary API. The older `request(model, prompt, options?)` method remains as an intentional compatibility wrapper and is marked for migration in the types.

## Implemented in Phase 1

The package includes typed request and response contracts, an `AIProvider` boundary, deterministic mock-provider infrastructure, local estimated cost tracking, validated configuration, typed errors, SHA-256 cache keys that do not contain raw prompts, and an asynchronous `MemoryCache` with TTL support. It builds as a CommonJS package with declarations and source maps.

## Not production-ready yet

Real provider integrations, actual provider token usage, production Redis, production-grade cost accuracy, advanced routing, full observability, OpenTelemetry, and provider-specific error mapping are **not implemented**. `RedisCache` is an explicit unavailable adapter boundary and performs no network calls. Mock output and estimated usage must not be treated as evidence of a real provider request.

## Configuration and privacy

`models` must be non-empty, `maxCostPerRequest` must be finite and greater than zero, and `cacheTTL` must be finite and non-negative. `loadConfig()` reads JSON plus `TOKA_API_KEY`, `TOKA_MODELS`, `TOKA_MAX_COST`, and `TOKA_CACHE_TTL`; environment values take precedence. The API key is optional for the mock provider and reserved for future integrations.

Toka does not log prompts, API keys, authorization headers, or send telemetry. Cache keys are hashes of canonicalized request data.

## Development

```bash
npm install
npm run check
npm run smoke
```

CI runs installation, linting, formatting checks, type checking, tests with coverage, build, and a built-package import smoke test.

## License

MIT © 2026 Abreham Wondimu Shiferaw
