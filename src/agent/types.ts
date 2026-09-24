export type AgentStage =
  | 'classification'
  | 'discovery'
  | 'planning'
  | 'generation'
  | 'testing'
  | 'debugging'
  | 'review'
  | 'final-response'
  | (string & {});

export interface AgentContext {
  agentId?: string;
  sessionId?: string;
  taskId?: string;
  stage?: AgentStage;
  repository?: string;
  commitSha?: string;
  toolName?: string;
  taskSuccess?: boolean;
  metadata?: Record<string, unknown>;
}

export interface DimensionCostSummary {
  dimension: 'agent' | 'repository' | 'task' | 'stage' | 'model';
  name: string;
  cost: number;
  requestsCount: number;
  tokensTotal: number;
}

export interface AgentCostSummary {
  totalCost: number;
  totalRequests: number;
  totalTokens: number;
  costByAgent: Record<string, number>;
  costByRepository: Record<string, number>;
  costByTask: Record<string, number>;
  costByStage: Record<string, number>;
  costByModel: Record<string, number>;
  topAgent: { id: string; cost: number } | null;
  topRepository: { id: string; cost: number } | null;
  topTask: { id: string; cost: number } | null;
  topStage: { id: string; cost: number } | null;
  topModel: { id: string; cost: number } | null;
  costPerSuccessfulTask?: number;
}
