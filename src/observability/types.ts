import { AgentContext } from '../agent/types';
import { RoutingDecision } from '../routing/types';

export interface UsageEvent {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  requestedModel: string;
  actualModel: string;
  routingDecision?: RoutingDecision;
  tokens: {
    input: number;
    output: number;
    total: number;
    cachedInput?: number;
  };
  cost: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    estimatedSavings?: number;
    currency: string;
  };
  costSource: 'actual' | 'estimated' | 'provider' | 'model_pricing' | 'fallback';
  latencyMs: number;
  cacheHit: boolean;
  fallbackOccurred: boolean;
  fallbackAttempts?: number;
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
  agentContext?: AgentContext;
}

export interface ReportFilter {
  fromDate?: string | Date;
  toDate?: string | Date;
  agentId?: string;
  repository?: string;
  taskId?: string;
  stage?: string;
  model?: string;
  provider?: string;
}

export interface CostReportSummary {
  totalCost: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: {
    input: number;
    output: number;
    total: number;
  };
  averageCostPerRequest: number;
  cacheHitRate: number;
  fallbackRate: number;
  retryRate: number;
  costPerSuccessfulTask: number;
}

export interface CostReport {
  summary: CostReportSummary;
  byTask: Record<string, number>;
  byAgent: Record<string, number>;
  byRepository: Record<string, number>;
  byModel: Record<string, number>;
  byStage: Record<string, number>;
  events: UsageEvent[];
}

export type EventCallback<T> = (data: T) => void | Promise<void>;
