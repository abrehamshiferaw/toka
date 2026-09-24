# Toka SDK

> Toka is an open-source cost-control and observability layer for LLM applications.

Toka is a TypeScript-first SDK for completion requests, provider-reported token usage, pricing-based cost calculation, and optional response caching. **Phase 2 implements one real OpenAI-compatible provider.** Gemini, Anthropic, Azure, Groq, Mistral, Ollama, Redis, routing, and telemetry integrations are not included.

## Installation

```bash
npm install toka-sdk
```

## Real provider quick start

Set `OPENAI_API_KEY` in the process environment, then provide an `OpenAIProvider` explicitly:

```ts
import { OpenAIProvider, Toka } from 'toka-sdk';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  timeoutMs: 30_000,
  retry: { maxRetries: 2, exponentialBackoff: true },
});

const toka = new Toka(
  { models: ['gpt-4o-mini'], maxCostPerRequest: 1 },
  undefined,
  provider,
);

const result = await toka.complete({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello, Toka!' }],
});

console.log({
  model: result.modelUsed,
  tokens: result.totalTokens,
  inputCost: result.inputCost,
  outputCost: result.outputCost,
  cost: result.cost,
  costSource: result.costSource,
});
```

The provider sends `POST /v1/chat/completions`, extracts the returned model and usage, and never logs the API key or full prompt. `Toka.complete()` remains the primary API; the older `request(model, prompt, options?)` method is retained as a compatibility wrapper.

## Pricing and usage

Built-in standard OpenAI pricing is centralized in `src/cost/pricing.ts` and is recorded per model as input and output USD prices per one million tokens. The current registry includes `gpt-4o-mini`, `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, and `gpt-3.5-turbo`. Prices are sourced from the [OpenAI API pricing documentation](https://developers.openai.com/api/docs/pricing) and include a registry version for maintenance.

When the provider returns usage, `costSource` is `actual` and cost is calculated as:

```text
inputCost = inputTokens / 1,000,000 × inputPricePerMillionTokens
outputCost = outputTokens / 1,000,000 × outputPricePerMillionTokens
cost = inputCost + outputCost
```

If usage is absent, the SDK makes a clearly marked local estimate from message and response text and returns `costSource: 'estimated'`. It never labels estimated usage as actual. Unknown provider/model pricing throws `TokaPricingError`; no default price is silently applied.

Custom pricing overrides are keyed by `provider:model`:

```ts
const toka = new Toka({
  models: ['my-model'],
  maxCostPerRequest: 1,
  pricing: {
    'openai:my-model': {
      inputPricePerMillionTokens: 1,
      outputPricePerMillionTokens: 3,
    },
  },
}, undefined, provider);
```

## Errors, timeouts, and retries

Provider failures are normalized into typed errors for authentication, invalid requests/models, rate limits, timeouts, network failures, provider 5xx responses, and pricing failures. Rate-limit responses preserve `Retry-After` when supplied. Retries are bounded, default to two retries with exponential backoff, and apply only to rate limits, timeouts, network failures, and provider 5xx responses. Authentication and malformed-request failures are never retried.

The provider default timeout is 30 seconds and can be overridden. Retry delays are capped at 30 seconds. Tests inject fetch and sleep functions, so CI makes no paid provider calls.

## Phase 1 compatibility and limitations

The deterministic `MockProvider` remains available for local tests and examples. Its usage and cost are explicitly estimated. `RedisCache` remains an unavailable adapter boundary and performs no network calls. Advanced routing, daily or monthly budgets, agent context, OpenTelemetry, dashboards, and additional provider adapters belong to later phases.

## Development

```bash
npm install
npm run check
npm run smoke
```

The quality gate runs linting, formatting checks, type checking, unit and provider contract tests with coverage, build, and a built-package import smoke test.

## License

MIT © 2026 Abreham Wondimu Shiferaw
