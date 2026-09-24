import {
  BudgetAction,
  BudgetContext,
  BudgetDecision,
  BudgetLimitStatus,
  BudgetPolicy,
  BudgetScope,
  BudgetStatus,
  BudgetViolation,
  ScopeLimit,
} from './types';
import {
  BudgetStore,
  InMemoryBudgetStore,
  ReservationItem,
  roundCost,
} from './store';
import { getNextModel } from '../fallback/modelFallback';
import { SDKRequest } from '../types';

export interface NormalizedLimit {
  limit: number;
  action: BudgetAction;
  warnThreshold?: number;
}

export class BudgetManager {
  private policy: BudgetPolicy;
  private store: BudgetStore;
  private readonly clock: () => Date;

  constructor(
    policy: BudgetPolicy = {},
    store?: BudgetStore,
    clock: () => Date = () => new Date()
  ) {
    this.policy = policy;
    this.store = store ?? new InMemoryBudgetStore();
    this.clock = clock;
  }

  getPolicy(): BudgetPolicy {
    return { ...this.policy };
  }

  setPolicy(policy: BudgetPolicy): void {
    this.policy = policy;
  }

  getStore(): BudgetStore {
    return this.store;
  }

  setStore(store: BudgetStore): void {
    this.store = store;
  }

  private normalizeLimit(
    scopeLimit?: ScopeLimit,
    defaultAction: BudgetAction = 'block'
  ): NormalizedLimit | null {
    if (scopeLimit === undefined || scopeLimit === null) return null;
    if (typeof scopeLimit === 'number') {
      return { limit: scopeLimit, action: defaultAction };
    }
    return {
      limit: scopeLimit.limit,
      action: scopeLimit.action ?? defaultAction,
      warnThreshold: scopeLimit.warnThreshold,
    };
  }

  private getDateKeys(): { dayKey: string; monthKey: string } {
    const date = this.clock();
    const timeZone = this.policy.timezone || 'UTC';
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const dayKey = formatter.format(date);
      const monthKey = dayKey.slice(0, 7);
      return { dayKey, monthKey };
    } catch {
      const iso = date.toISOString();
      return { dayKey: iso.slice(0, 10), monthKey: iso.slice(0, 7) };
    }
  }

  async evaluate(
    request: SDKRequest,
    estimatedCost: number,
    availableModels: string[] = []
  ): Promise<BudgetDecision> {
    const defaultAction: BudgetAction =
      this.policy.action ?? this.policy.defaultAction ?? 'block';

    const normalizedCost = roundCost(estimatedCost);

    // 1. Check Approval-Required flow
    if (
      this.policy.approvalRequiredAbove !== undefined &&
      this.policy.approvalRequiredAbove !== null &&
      normalizedCost > this.policy.approvalRequiredAbove &&
      request.budgetContext?.approved !== true
    ) {
      return {
        allowed: false,
        action: 'approval_required',
        estimatedCost: normalizedCost,
        limits: [],
        violations: [],
        remaining: 0,
        reason: `Estimated request cost of $${normalizedCost} exceeds the configured approval threshold of $${this.policy.approvalRequiredAbove}. Explicit approval is required.`,
        approval: {
          required: true,
          threshold: this.policy.approvalRequiredAbove,
        },
      };
    }

    // 2. Resolve active limits across all scopes
    const { dayKey, monthKey } = this.getDateKeys();
    const scopesToCheck: Array<{
      scope: BudgetScope;
      key?: string;
      limitConfig: NormalizedLimit;
    }> = [];

    const reqLimit = this.normalizeLimit(this.policy.perRequest, defaultAction);
    if (reqLimit) {
      scopesToCheck.push({ scope: 'request', limitConfig: reqLimit });
    }

    const taskLimit = this.normalizeLimit(this.policy.perTask, defaultAction);
    if (taskLimit && request.budgetContext?.taskId) {
      scopesToCheck.push({
        scope: 'task',
        key: request.budgetContext.taskId,
        limitConfig: taskLimit,
      });
    }

    const sessionLimit = this.normalizeLimit(
      this.policy.perSession,
      defaultAction
    );
    if (sessionLimit && request.budgetContext?.sessionId) {
      scopesToCheck.push({
        scope: 'session',
        key: request.budgetContext.sessionId,
        limitConfig: sessionLimit,
      });
    }

    const dayLimit = this.normalizeLimit(this.policy.perDay, defaultAction);
    if (dayLimit) {
      scopesToCheck.push({
        scope: 'day',
        key: dayKey,
        limitConfig: dayLimit,
      });
    }

    const monthLimit = this.normalizeLimit(this.policy.perMonth, defaultAction);
    if (monthLimit) {
      scopesToCheck.push({
        scope: 'month',
        key: monthKey,
        limitConfig: monthLimit,
      });
    }

    const limitStatuses: BudgetLimitStatus[] = [];
    const violations: BudgetViolation[] = [];
    let minRemaining = Infinity;

    for (const item of scopesToCheck) {
      const spent =
        item.scope === 'request'
          ? 0
          : await this.store.getUsage(item.scope, item.key);
      const remaining = roundCost(Math.max(0, item.limitConfig.limit - spent));
      if (remaining < minRemaining) {
        minRemaining = remaining;
      }

      const proposed = roundCost(spent + normalizedCost);
      const exceeded = proposed > item.limitConfig.limit;

      const status: BudgetLimitStatus = {
        scope: item.scope,
        limit: item.limitConfig.limit,
        spent,
        remaining,
        action: item.limitConfig.action,
        exceeded,
      };
      limitStatuses.push(status);

      if (exceeded) {
        violations.push({
          scope: item.scope,
          limit: item.limitConfig.limit,
          spent,
          remaining,
          requestedCost: normalizedCost,
          action: item.limitConfig.action,
        });
      }
    }

    if (minRemaining === Infinity) {
      minRemaining = 0;
    }

    // 3. Determine decision outcome
    if (violations.length === 0) {
      return {
        allowed: true,
        action: 'allow',
        estimatedCost: normalizedCost,
        limits: limitStatuses,
        violations: [],
        remaining: minRemaining,
        reason: `Estimated request cost of $${normalizedCost} is allowed under all active budget limits.`,
      };
    }

    const blockViolation = violations.find((v) => v.action === 'block');
    const fallbackViolation = violations.find((v) => v.action === 'fallback');
    const primaryViolation =
      blockViolation ?? fallbackViolation ?? violations[0];

    const action: BudgetAction = primaryViolation.action;
    let allowed = false;

    if (action === 'warn') {
      allowed = true;
    }

    let reason = `Estimated request cost of $${normalizedCost} exceeds the remaining ${primaryViolation.scope} budget of $${primaryViolation.remaining} (limit: $${primaryViolation.limit}, spent: $${primaryViolation.spent}).`;

    let fallbackData:
      | { recommendedModel?: string | null; availableModels?: string[] }
      | undefined;

    if (action === 'fallback') {
      const rec = getNextModel(request.model, availableModels);
      fallbackData = {
        recommendedModel: rec,
        availableModels,
      };
      reason = `${reason} Fallback action triggered; recommended model: ${rec ?? 'none available'}.`;
    }

    return {
      allowed,
      action,
      estimatedCost: normalizedCost,
      limits: limitStatuses,
      violations,
      remaining: minRemaining,
      reason,
      fallback: fallbackData,
    };
  }

  async evaluateAndReserve(
    request: SDKRequest,
    estimatedCost: number,
    availableModels: string[] = []
  ): Promise<{ decision: BudgetDecision; reservationId: string | null }> {
    const decision = await this.evaluate(
      request,
      estimatedCost,
      availableModels
    );

    if (!decision.allowed && decision.action !== 'warn') {
      return { decision, reservationId: null };
    }

    const { dayKey, monthKey } = this.getDateKeys();
    const items: ReservationItem[] = [];

    for (const lim of decision.limits) {
      let key: string | undefined;
      if (lim.scope === 'task') key = request.budgetContext?.taskId;
      if (lim.scope === 'session') key = request.budgetContext?.sessionId;
      if (lim.scope === 'day') key = dayKey;
      if (lim.scope === 'month') key = monthKey;

      items.push({
        scope: lim.scope,
        key,
        amount: decision.estimatedCost,
        limit: lim.limit,
      });
    }

    const res = await this.store.reserve(items);
    if (!res.success) {
      if (decision.action === 'warn') {
        return { decision, reservationId: null };
      }
      const viol = res.violation;
      const rejectedDecision: BudgetDecision = {
        ...decision,
        allowed: false,
        action: 'block',
        remaining: viol?.remaining ?? 0,
        reason: viol
          ? `Estimated request cost of $${decision.estimatedCost} exceeds the remaining ${viol.scope} budget of $${viol.remaining} (limit: $${viol.limit}, spent: $${viol.spent}).`
          : decision.reason,
        violations: viol
          ? [
              {
                scope: viol.scope,
                limit: viol.limit,
                spent: viol.spent,
                remaining: viol.remaining,
                requestedCost: viol.requestedCost,
                action: 'block',
              },
            ]
          : decision.violations,
      };
      return { decision: rejectedDecision, reservationId: null };
    }

    return { decision, reservationId: res.reservationId ?? null };
  }

  async commit(
    reservationId: string | null,
    actualCost: number,
    context?: BudgetContext
  ): Promise<void> {
    const { dayKey, monthKey } = this.getDateKeys();
    const actualItems: Array<{
      scope: BudgetScope;
      key?: string;
      amount: number;
    }> = [];

    const defaultAction: BudgetAction =
      this.policy.action ?? this.policy.defaultAction ?? 'block';

    if (this.normalizeLimit(this.policy.perRequest, defaultAction)) {
      actualItems.push({
        scope: 'request',
        amount: actualCost,
      });
    }
    if (
      this.normalizeLimit(this.policy.perTask, defaultAction) &&
      context?.taskId
    ) {
      actualItems.push({
        scope: 'task',
        key: context.taskId,
        amount: actualCost,
      });
    }
    if (
      this.normalizeLimit(this.policy.perSession, defaultAction) &&
      context?.sessionId
    ) {
      actualItems.push({
        scope: 'session',
        key: context.sessionId,
        amount: actualCost,
      });
    }
    if (this.normalizeLimit(this.policy.perDay, defaultAction)) {
      actualItems.push({
        scope: 'day',
        key: dayKey,
        amount: actualCost,
      });
    }
    if (this.normalizeLimit(this.policy.perMonth, defaultAction)) {
      actualItems.push({
        scope: 'month',
        key: monthKey,
        amount: actualCost,
      });
    }

    if (reservationId) {
      await this.store.commitReservation(reservationId, actualItems);
    } else {
      for (const item of actualItems) {
        await this.store.incrementUsage(item.scope, item.key, item.amount);
      }
    }
  }

  async release(reservationId: string | null): Promise<void> {
    if (reservationId) {
      await this.store.releaseReservation(reservationId);
    }
  }

  async getStatus(context?: BudgetContext): Promise<BudgetStatus> {
    const { dayKey, monthKey } = this.getDateKeys();
    const defaultAction: BudgetAction =
      this.policy.action ?? this.policy.defaultAction ?? 'block';

    const limits: BudgetStatus['limits'] = {};
    const blockedScopes: BudgetScope[] = [];
    const activeWarnings: string[] = [];

    const checkScope = async (
      scope: BudgetScope,
      scopeLimit: ScopeLimit | undefined,
      key?: string
    ) => {
      const norm = this.normalizeLimit(scopeLimit, defaultAction);
      if (!norm) return;
      const spent =
        scope === 'request' ? 0 : await this.store.getUsage(scope, key);
      const remaining = roundCost(Math.max(0, norm.limit - spent));
      const exceeded = spent >= norm.limit;

      limits[scope] = {
        limit: norm.limit,
        spent,
        remaining,
        action: norm.action,
        exceeded,
      };

      if (exceeded) {
        if (norm.action === 'block' || norm.action === 'fallback') {
          blockedScopes.push(scope);
        } else if (norm.action === 'warn') {
          activeWarnings.push(
            `Budget warning for scope '${scope}': spent $${spent} has reached or exceeded limit $${norm.limit}.`
          );
        }
      }
    };

    await checkScope('request', this.policy.perRequest);
    if (context?.taskId) {
      await checkScope('task', this.policy.perTask, context.taskId);
    }
    if (context?.sessionId) {
      await checkScope('session', this.policy.perSession, context.sessionId);
    }
    await checkScope('day', this.policy.perDay, dayKey);
    await checkScope('month', this.policy.perMonth, monthKey);

    return {
      limits,
      activeWarnings,
      blockedScopes,
      context,
    };
  }

  async reset(scope?: BudgetScope, key?: string): Promise<void> {
    await this.store.reset(scope, key);
  }
}
