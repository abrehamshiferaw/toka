# Toka SDK

> Toka is an open-source cost-control and observability layer for LLM applications.

Toka is a TypeScript-first SDK for completion requests, provider-reported token usage, pricing-based cost calculation, optional response caching, and a multi-scope cost control engine.

- **Phase 1**: Foundation & Trust (types, mock provider, caching contracts, configuration).
- **Phase 2**: Real OpenAI Provider & Accurate Cost Pipeline.
- **Phase 3**: Cost Control Engine (per-request, per-task, per-session, daily, monthly budgets, hard/soft limits, approval flows).

*Later phases will implement smart model routing (Phase 4), agent context (Phase 5), distributed Redis caching (Phase 6), and OpenTelemetry observability (Phase 7).*

---

## Installation

```bash
npm install toka-sdk
```

---

## Phase 3: Cost Control Engine

Phase 3 introduces a robust, typed, predictable budget policy system that prevents unexpected AI spending across multiple scopes and lifecycles.

### Budget Scopes

| Scope | Identifier Source | Description | Reset Lifecycle |
|---|---|---|---|
| `perRequest` | Current request | Maximum spending cap per single completion. | Evaluated per request. |
| `perTask` | `request.budgetContext.taskId` | Cumulative spending cap across multiple requests in one task. | Manual reset or per task ID. |
| `perSession` | `request.budgetContext.sessionId` | Cumulative spending cap across multiple tasks/requests in a session. | Manual reset or per session ID. |
| `perDay` | Calendar day (`YYYY-MM-DD`) | Daily organization/app spending limit in specified timezone. | Automatically resets at day boundary. |
| `perMonth` | Calendar month (`YYYY-MM`) | Monthly organization/app spending limit in specified timezone. | Automatically resets at month boundary. |

### Budget Policy Configuration

Budgets can be configured on the SDK instance or via environment variables:

```ts
import { Toka, BudgetPolicy } from 'toka-sdk';

const budgets: BudgetPolicy = {
  // Simple numeric limits (default to configured action)
  perRequest: 0.05,
  perTask: 0.50,
  perSession: 2.00,
  perDay: 25.00,
  perMonth: 500.00,

  // Default action when a limit is exceeded: 'block' | 'warn' | 'fallback'
  defaultAction: 'block',

  // Require explicit approval before dispatching requests over this estimated cost
  approvalRequiredAbove: 0.10,

  // Timezone for daily and monthly calendar boundaries (defaults to 'UTC')
  timezone: 'UTC',
};

const toka = new Toka({
  models: ['gpt-4o-mini', 'gpt-4o'],
  budgets,
});
```

### Granular Scope Limit Objects (Hard vs Soft Limits)

Scopes can also specify custom actions or warn thresholds:

```ts
const budgets: BudgetPolicy = {
  // Soft limit: warn and continue execution
  perRequest: {
    limit: 0.02,
    action: 'warn',
  },
  // Hard limit: block execution immediately before provider call
  perTask: {
    limit: 1.00,
    action: 'block',
  },
  // Fallback: trigger recommended cheaper model fallback
  perDay: {
    limit: 50.00,
    action: 'fallback',
  },
};
```

### Supported Actions

1. **`block`**: Halts execution before calling the provider and throws a typed `TokaBudgetExceededError`.
2. **`warn`**: Allows execution to proceed and attaches structured `budgetWarning` metadata to `SDKResponse`.
3. **`fallback`**: Halts execution and provides structured fallback metadata (including `recommendedModel`) on the decision.
4. **`approval_required`**: Intercepts requests whose estimated cost exceeds `approvalRequiredAbove`. Throws `TokaBudgetExceededError` until explicitly approved via `budgetContext: { approved: true }`.

---

## Executing Requests with Budget Context

Pass `budgetContext` to correlate requests with tasks and sessions:

```ts
const response = await toka.complete({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Generate quarterly financial summary.' }],
  maxTokens: 500,
  budgetContext: {
    taskId: 'task-report-q3',
    sessionId: 'session-user-123',
    approved: false, // Set to true if an expensive request was explicitly approved by user
  },
});

console.log({
  cost: response.cost,
  budgetDecision: response.budgetDecision,
  budgetWarning: response.budgetWarning, // Present if a soft limit triggered a warning
});
```

---

## Pre-Request Budget Evaluation API

Inspect whether a request will pass budget limits without calling the AI provider:

```ts
const decision = await toka.evaluateBudget({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Extensive analysis...' }],
  budgetContext: { taskId: 'task-report-q3' },
});

console.log(decision.allowed); // boolean
console.log(decision.action);  // 'allow' | 'warn' | 'fallback' | 'block' | 'approval_required'
console.log(decision.estimatedCost);
console.log(decision.remaining);
console.log(decision.limits);    // active scope statuses
```

---

## Inspecting and Resetting Budgets

```ts
// Inspect remaining caps across active scopes
const status = await toka.getBudgetStatus({ taskId: 'task-report-q3' });
console.log(status.limits.task); // { limit: 0.50, spent: 0.12, remaining: 0.38, ... }
console.log(status.blockedScopes);

// Reset spending counters (all scopes or specific scope/key)
await toka.resetBudget(); // Reset all in-memory spending counters
await toka.resetBudget('task', 'task-report-q3'); // Reset specific task
```

---

## Typed `TokaBudgetExceededError`

When a limit or approval rule blocks a request, `TokaBudgetExceededError` provides rich, typed diagnostics:

```ts
try {
  await toka.complete(request);
} catch (err) {
  if (err instanceof TokaBudgetExceededError) {
    console.error(err.code);          // 'BUDGET_EXCEEDED'
    console.error(err.scope);         // 'task' | 'request' | 'session' | 'day' | 'month'
    console.error(err.limit);         // Configured limit amount ($)
    console.error(err.spent);         // Current cumulative spending ($)
    console.error(err.remaining);     // Remaining budget ($)
    console.error(err.requestedCost); // Estimated cost of the rejected request ($)
    console.error(err.action);        // 'block' | 'fallback' | 'approval_required'
    console.error(err.decision);      // Full BudgetDecision object
  }
}
```

---

## Storage & Concurrency Architecture

- **Atomic Pre-Request Reservation**: Before dispatching a provider call, Toka atomically verifies all active limits and reserves the estimated cost. If parallel requests concurrently attempt to exhaust the remaining budget, subsequent requests are safely blocked before making provider calls.
- **Post-Request Exact Commitment**: Upon successful provider completion, the actual reported token cost is committed to spending counters and the reservation is released.
- **Failure Safety**: If a provider call fails, times out, or is rate-limited, the reservation is released immediately with zero spending accrued.
- **Process-Local Storage Limitation**: In Phase 3, spending accounting is process-local and in-memory (`InMemoryBudgetStore`). In-memory counters do not persist across process restarts and are not distributed across multi-node clusters (distributed Redis storage is scheduled for Phase 6).

---

## Backward Compatibility with `maxCostPerRequest`

Legacy configurations using `maxCostPerRequest` are fully supported and seamlessly mapped to the budget engine:

```ts
// Legacy 1.x / Phase 2 style:
const toka = new Toka({
  models: ['gpt-4o-mini'],
  maxCostPerRequest: 0.05,
});

// Behaves equivalently to:
const toka = new Toka({
  models: ['gpt-4o-mini'],
  budgets: {
    perRequest: 0.05,
    defaultAction: 'block',
  },
});
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `TOKA_API_KEY` | Toka API key. |
| `OPENAI_API_KEY` | OpenAI API key. |
| `TOKA_MODELS` | Comma-separated list of allowed models. |
| `TOKA_MAX_COST` | Per-request budget cap (backward compatible). |
| `TOKA_BUDGET_PER_REQUEST` | Budget per request ($). |
| `TOKA_BUDGET_PER_TASK` | Budget per task ($). |
| `TOKA_BUDGET_PER_SESSION` | Budget per session ($). |
| `TOKA_BUDGET_PER_DAY` | Budget per calendar day ($). |
| `TOKA_BUDGET_PER_MONTH` | Budget per calendar month ($). |
| `TOKA_BUDGET_ACTION` | Default action: `block`, `warn`, or `fallback`. |
| `TOKA_APPROVAL_THRESHOLD`| Cost threshold above which explicit approval is required ($). |
| `TOKA_TIMEZONE` | IANA timezone for daily/monthly boundaries (e.g. `America/New_York`, `UTC`). |

---

## Development & Verification

Run the full verification suite (linting, Prettier formatting, TypeScript typecheck, coverage tests, and smoke test):

```bash
npm run check
```

---

## License

MIT © 2026 Abreham Wondimu Shiferaw
