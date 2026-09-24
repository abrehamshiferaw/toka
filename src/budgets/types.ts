export type BudgetAction = 'allow' | 'warn' | 'fallback' | 'block';
export type BudgetScope = 'request' | 'task' | 'session' | 'day' | 'month';

export interface BudgetLimitConfig {
  limit: number;
  action?: BudgetAction;
  warnThreshold?: number;
}

export type ScopeLimit = number | BudgetLimitConfig;

export interface BudgetPolicy {
  perRequest?: ScopeLimit;
  perTask?: ScopeLimit;
  perSession?: ScopeLimit;
  perDay?: ScopeLimit;
  perMonth?: ScopeLimit;
  action?: BudgetAction;
  defaultAction?: BudgetAction;
  approvalRequiredAbove?: number;
  timezone?: string;
}

export interface BudgetContext {
  taskId?: string;
  sessionId?: string;
  approved?: boolean;
  [key: string]: unknown;
}

export interface BudgetViolation {
  scope: BudgetScope;
  limit: number;
  spent: number;
  remaining: number;
  requestedCost: number;
  action: BudgetAction;
}

export interface BudgetLimitStatus {
  scope: BudgetScope;
  limit: number;
  spent: number;
  remaining: number;
  action: BudgetAction;
  exceeded: boolean;
}

export interface BudgetDecision {
  allowed: boolean;
  action: 'allow' | 'warn' | 'fallback' | 'block' | 'approval_required';
  estimatedCost: number;
  limits: BudgetLimitStatus[];
  violations: BudgetViolation[];
  remaining: number;
  reason: string;
  approval?: {
    required: boolean;
    threshold?: number;
  };
  fallback?: {
    recommendedModel?: string | null;
    availableModels?: string[];
  };
}

export interface BudgetWarning {
  scope: BudgetScope;
  limit: number;
  spent: number;
  remaining: number;
  message: string;
}

export interface BudgetStatus {
  limits: Partial<
    Record<
      BudgetScope,
      {
        limit: number;
        spent: number;
        remaining: number;
        action: BudgetAction;
        exceeded: boolean;
      }
    >
  >;
  activeWarnings: string[];
  blockedScopes: BudgetScope[];
  context?: BudgetContext;
}
