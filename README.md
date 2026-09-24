# Toka SDK

> **Toka** is an open-source cost-control, smart model routing, and observability engine specifically engineered for LLM applications and AI code agents.

Toka sits between your autonomous agents and LLM providers (OpenAI, Anthropic, Google, and local models) to ensure transparent spending, eliminate silent downgrades, enforce multi-scope budgets, provide revision-aware caching, and deliver deep cost intelligence.

---

## ⚡ 1-Minute Quick Start

```bash
npm install toka-sdk
```

```typescript
import { Toka, OpenAIProvider } from 'toka-sdk';

const toka = new Toka({
  apiKey: process.env.OPENAI_API_KEY,
  models: ['gpt-4o', 'gpt-4o-mini'],
  routing: 'balanced', // Automatically optimizes quality & cost
  budgets: {
    perRequest: 0.10,
    perTask: 0.50,
  },
});

const response = await toka.complete({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Generate a TypeScript function.' }],
  agentContext: {
    agentId: 'coder-bot',
    taskId: 'task-101',
    stage: 'generation',
    repository: 'github.com/acme/backend',
  },
});

console.log(`Model: ${response.modelUsed}`);
console.log(`Cost:  $${response.cost.toFixed(6)}`);
console.log(`Why:   ${response.routingDecision?.reason}`);
```

---

## 🎯 Architecture & Phases

```
┌────────────────────────────────────────────────────────┐
│                      AI / Code Agent                   │
└───────────────────────────┬────────────────────────────┘
                            │ (AgentContext & Request)
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Toka Control Engine                  │
│                                                        │
│  [Phase 4] Smart Model Router                          │
│     ├── Policies: cheapest | balanced | quality-first  │
│     └── Transparent Explanations & Savings             │
│                                                        │
│  [Phase 6] Production Caching                          │
│     ├── SHA-256 Hashed Keys (Repo & Commit-Aware)      │
│     ├── Redis & Memory Adapters + Metrics              │
│     └── Sensitive Data Protection & Auto-Bypass        │
│                                                        │
│  [Phase 3] Multi-Scope Budget Guard                    │
│     ├── Scopes: Request, Task, Session, Day, Month     │
│     └── Actions: Block, Warn, Fallback, Human Approval │
│                                                        │
│  [Phase 5 & 7] Cost Intelligence & Observability       │
│     ├── Multi-Dimensional Analytics (Agent/Repo/Stage) │
│     ├── Standardized UsageEvents & JSON Logger         │
│     └── OpenTelemetry Semantic GenAI Conventions       │
└───────────────────────────┬────────────────────────────┘
                            │ (Optimized LLM Request)
                            ▼
┌────────────────────────────────────────────────────────┐
│             Real Providers (OpenAI, Mock, etc.)        │
└────────────────────────────────────────────────────────┘
```

---

## 🧭 Phase 4: Smart Model Routing

Replace brittle model lists with intelligent, policy-driven model selection.

### Routing Policies

| Policy | Behavior | Best Used For |
|---|---|---|
| `strict-model` | Never changes the requested model; fails or stays strictly on requested model. | Production pipelines requiring exact model behavior. |
| `cheapest` | Identifies lowest-cost model meeting capability and token context limits. | High-volume tasks, extraction, formatting, classifications. |
| `balanced` | Balances quality tier and cost (standard/fast tier) without extreme economy degradation. | General code agent execution, discovery, and testing. |
| `quality-first` | Prioritizes flagship/frontier models and selects the most cost-effective among top tier. | Complex system architecture, difficult debugging, security audits. |

### Transparent Explanations & Zero Silent Downgrades

Every routing decision explains:
1. **Requested model**
2. **Actual model**
3. **Why it changed**
4. **Estimated cost & savings**

```typescript
const res = await toka.complete({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Format table' }],
  routing: 'cheapest',
});

console.log(res.routingDecision);
// {
//   requestedModel: 'gpt-4o',
//   actualModel: 'gpt-4o-mini',
//   policy: 'cheapest',
//   reason: "Routed from 'gpt-4o' to 'gpt-4o-mini' via 'cheapest' policy. Estimated savings: $0.002400 while meeting capability criteria.",
//   estimatedCost: 0.00015,
//   estimatedSavings: 0.0024,
//   changed: true
// }
```

---

## 🤖 Phase 5: Agent-Aware Context

Toka tracks execution metadata across your entire autonomous workflow:

### Agent Stages
- `classification`
- `discovery`
- `planning`
- `generation`
- `testing`
- `debugging`
- `review`
- `final-response`

### Real-Time Cost Attribution
Instantly query:
- *Which agent, repository, task, stage, or model is consuming the most money?*
- *What is the cost per successful task?*

```typescript
toka.getCostByAgent('refactor-bot');
toka.getCostByRepository('acme/webapp');
toka.getCostByStage('debugging');
toka.getCostByModel('gpt-4o');
toka.getTopSpenders();
// {
//   topAgent: { id: 'refactor-bot', cost: 1.45 },
//   topRepository: { id: 'acme/webapp', cost: 2.10 },
//   topStage: { id: 'debugging', cost: 1.20 }
// }
```

---

## 🔒 Phase 6: Production Caching & Sensitive Data Protection

### Repository & Commit Revision Awareness
Coding agents frequently modify files. If a prompt runs against commit `c0ffee1`, and a subsequent request runs against commit `c0ffee2`, Toka creates revision-specific keys so **stale code responses are never reused after changes**:

```typescript
const key = createCacheKey({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Analyze auth.ts' }],
  agentContext: {
    repository: 'org/repo',
    commitSha: 'c0ffee1', // Incorporates into SHA-256 hash
  },
});
```

### Sensitive Content Protection
Toka automatically scans prompts for sensitive tokens (OpenAI keys, GitHub tokens, AWS credentials, private keys, passwords) and checks `sensitive: true`. **Sensitive requests completely bypass caching** so confidential secrets are never retained in shared or Redis caches.

### Redis & Memory Adapters
```typescript
import { MemoryCache, RedisCache } from 'toka-sdk';

// LRU in-memory cache with eviction and size limits
const memory = new MemoryCache({ maxEntries: 1000, ttlMs: 300000 });

// Production Redis cache adapter
const redis = new RedisCache({ client: redisClient, namespace: 'agent-cache' });
```

---

## 📊 Phase 7: Observability & OpenTelemetry

### Standardized `UsageEvent`
Emitted for every request, fallback, or cache hit:
- Provider & model (requested vs actual)
- Token breakdown (input, output, total, cachedInput)
- Precise cost and source (`actual` vs `estimated`)
- Latency in milliseconds
- Cache hit status & savings
- Agent context (`agentId`, `taskId`, `stage`, `repository`)

### Structured Events & Reports
```typescript
toka.on('usage', (event) => {
  console.log(`[Usage] ${event.actualModel} - $${event.cost.totalCost.toFixed(6)}`);
});

toka.on('budgetWarning', (warning) => {
  console.warn(`[Budget Warning] Scope ${warning.scope} exceeded threshold!`);
});

// Generate reports and export
const report = toka.generateReport();
console.log(toka.formatReportTable());
fs.writeFileSync('report.json', toka.exportJson());
fs.writeFileSync('report.csv', toka.exportCsv());
```

### OpenTelemetry Integration
Toka provides native attribute mapping for OpenTelemetry GenAI semantic conventions:
- `gen_ai.system`
- `gen_ai.request.model`
- `gen_ai.response.model`
- `gen_ai.usage.input_tokens`
- `gen_ai.usage.output_tokens`
- `toka.cost.usd`
- `toka.agent.id`
- `toka.repository`

---

## 🛠️ Phase 8: CLI Commands

Toka includes a dedicated command-line tool:

```bash
# View registered models, pricing, quality tier, and context limits
npx toka models

# Run a diagnostic check
npx toka check

# Simulate smart model routing and view transparent explanation
npx toka route --model gpt-4o --policy cheapest

# Generate a formatted terminal report from exported usage events
npx toka report events.json
```

---

## 📁 Code Agent Examples

Check out `examples/code-agent/`:
- `basic-agent.ts`: Basic coding agent with context tracking.
- `budget-aware-agent.ts`: Enforcing task and session budgets.
- `repository-agent.ts`: Multi-stage agent with commit revision awareness.
- `approval-flow.ts`: Human-in-the-loop approval thresholds.
- `model-routing.ts`: Proactive model routing policies.
- `observability.ts`: Structured events, JSON/CSV exports, and OpenTelemetry.

Run any example directly:
```bash
npx ts-node examples/code-agent/basic-agent.ts
```

---

## 📄 License

MIT © [Abreham Wondimu Shiferaw](https://github.com/abrehamshiferaw/toka)
