# Toka SDK Migration Guide

This guide assists developers in migrating from Toka 1.x to Toka 2.x.

## Overview of 2.x

Toka 2.x transforms the SDK from a basic wrapper into an enterprise-grade cost-control, smart routing, and observability engine specifically engineered for AI and code agents.

Key capabilities introduced:
- **Phase 4**: Smart Model Routing (`cheapest`, `balanced`, `quality-first`, `strict-model`) with transparent explanations and estimated savings.
- **Phase 5**: Agent Context (`agentId`, `sessionId`, `taskId`, `stage`, `repository`, `commitSha`) with cost intelligence across all dimensions.
- **Phase 6**: Production Caching with LRU MemoryCache, Redis adapter, SHA-256 hashed keys, revision-aware keys, and sensitive data protection.
- **Phase 7**: Standardized `UsageEvent`, event emitter (`toka.on('usage', ...)`), structured JSON logger, OpenTelemetry semantic conventions, and JSON/CSV reports.
- **Phase 8**: CLI tool (`toka`), agent starter templates, and production GitHub workflows.

---

## 1. Zero Breaking Changes Policy

Toka 2.x retains 100% backward compatibility with all 1.x methods:
- `toka.request(model, prompt, options)` remains fully supported as a compatibility wrapper.
- `toka.complete(request)` is the recommended modern API returning granular token breakdowns and pricing details.
- Legacy `MemoryCache` and configuration formats continue to work without modification.

---

## 2. Upgrading Requests

### 1.x Legacy Style
```typescript
const result = await toka.request('gpt-4', 'Explain recursion');
console.log(result.tokens, result.cost);
```

### 2.x Recommended Modern Style
```typescript
const result = await toka.complete({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Explain recursion' }],
  routing: 'balanced', // Smart model routing
  agentContext: {
    agentId: 'swe-agent',
    taskId: 'task-101',
    stage: 'generation',
    repository: 'github.com/org/repo',
  },
});

console.log(result.cost, result.modelUsed, result.routingDecision);
```

---

## 3. Smart Model Routing

In 1.x, fallback was purely sequential on budget failure. In 2.x, proactive routing evaluates models before provider calls:

```typescript
const toka = new Toka({
  models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1'],
  routing: 'cheapest', // or 'balanced', 'quality-first', 'strict-model'
  maxCostPerRequest: 0.5,
});
```

Every response explains the routing decision:
```typescript
console.log(response.routingDecision);
// {
//   requestedModel: 'gpt-4o',
//   actualModel: 'gpt-4o-mini',
//   policy: 'cheapest',
//   reason: "Routed from 'gpt-4o' to 'gpt-4o-mini' via 'cheapest' policy. Estimated savings: $0.0024...",
//   estimatedCost: 0.00015,
//   estimatedSavings: 0.00235,
//   changed: true
// }
```

---

## 4. Multi-Stage Agent Context

Tag your LLM calls with execution context:

```typescript
await toka.complete({
  model: 'gpt-4o',
  messages: [...],
  agentContext: {
    agentId: 'refactor-bot',
    repository: 'acme/backend',
    commitSha: 'a1b2c3d4e5f6',
    taskId: 'issue-104',
    stage: 'discovery', // classification, discovery, planning, generation, testing, review, final-response
  },
});
```

Query analytics instantly:
```typescript
toka.getCostByAgent('refactor-bot');
toka.getCostByRepository('acme/backend');
toka.getCostByStage('discovery');
toka.getTopSpenders();
```

---

## 5. Production Caching & Revision Awareness

Toka's cache keys incorporate `repository` and `commitSha`. When code changes in a repo, cache keys update automatically:

```typescript
import { Toka, MemoryCache, RedisCache } from 'toka-sdk';

// In-Memory with LRU and size bounds
const cache = new MemoryCache({ maxEntries: 5000, ttlMs: 3600000 });

// Or Production Redis
const redis = new RedisCache({ client: redisClient, namespace: 'agent' });
```

Requests containing sensitive tokens (API keys, private keys, passwords) or marked `sensitive: true` automatically bypass caching.

---

## 6. Observability & OpenTelemetry

Subscribe to standardized events:
```typescript
toka.on('usage', (event) => {
  console.log(`[Usage] Model: ${event.actualModel} | Cost: $${event.cost.totalCost}`);
});

toka.on('routing', (decision) => {
  console.log(`[Routing] Switched to ${decision.actualModel}`);
});
```

Export cost reports:
```typescript
const report = toka.generateReport();
const json = toka.exportJson();
const csv = toka.exportCsv();
```
