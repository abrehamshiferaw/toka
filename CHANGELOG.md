# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.3.0] - 2026-09-24

### Added
- **Phase 4: Smart Model Routing**
  - Rich model metadata catalog (`ModelMetadata`, `QualityTier`, `ModelCapability`, `ModelPricingDetails`, `ContextLimits`).
  - Proactive routing policies: `cheapest`, `balanced`, `quality-first`, `strict-model`.
  - Explainable routing decisions (`RoutingDecision`) with `requestedModel`, `actualModel`, `reason`, `estimatedCost`, `estimatedSavings`.
  - Elimination of silent model downgrades.
- **Phase 5: Agent-Aware Toka**
  - Granular agent context (`agentId`, `sessionId`, `taskId`, `stage`, `repository`, `commitSha`, `toolName`).
  - Native support for agent execution stages (`classification`, `discovery`, `planning`, `generation`, `testing`, `debugging`, `review`, `final-response`).
  - Dimensional cost analytics (`getCostByAgent`, `getCostByRepository`, `getCostByTask`, `getCostByStage`, `getCostByModel`, `getTopSpenders`).
  - Cost per successful task metric (`costPerSuccessfulTask`).
- **Phase 6: Production Caching**
  - Production `RedisCache` adapter with namespace support, TTL, and cache metrics.
  - LRU-enabled `MemoryCache` with `maxEntries` bound and eviction tracking.
  - SHA-256 hashed cache keys with repository and commit revision awareness.
  - Sensitive content detection (`isSensitiveRequest`) and automatic cache bypass for credentials and secrets.
  - Cache invalidation by namespace and pattern.
- **Phase 7: Observability & Cost Intelligence**
  - Standardized `UsageEvent` data structure.
  - Toka event emitter (`toka.on('usage')`, `toka.on('routing')`, `toka.on('budgetWarning')`, `toka.on('cacheHit')`).
  - Structured JSON logger (`TokaLogger`).
  - Cost intelligence reports (`CostReporter`) with JSON and CSV exports.
  - OpenTelemetry integration with GenAI semantic conventions (`gen_ai.system`, `gen_ai.request.model`, `toka.cost.usd`).
- **Phase 8: Developer Experience & Ecosystem**
  - Executable CLI (`toka`) with `models`, `report`, `route`, and `check` commands.
  - Six production-ready code agent examples in `examples/code-agent/`.
  - Comprehensive migration guide (`MIGRATION.md`).
  - Security policy and vulnerability disclosures (`SECURITY.md`).
  - CI, CodeQL, and Dependabot GitHub workflows.

---

## [2.0.0] - 2026-09-24

### Added
- Real OpenAI provider integration (`OpenAIProvider`) with streaming, retries, and token breakdown.
- Multi-tier budget engine with atomic reservations (`BudgetManager`, `InMemoryBudgetStore`).
- Per-request, per-task, per-session, per-day, and per-month budget limits.
- Configurable budget actions: `block`, `warn`, `fallback`, `approval_required`.

---

## [1.3.0] - 2026-09-24

### Added
- Core Toka client foundation (`Toka`, `MockProvider`, `MemoryCache`).
- Accurate pricing registry for OpenAI models.
- Standardized error hierarchy (`TokaError`, `TokaBudgetExceededError`, `TokaPricingError`).
