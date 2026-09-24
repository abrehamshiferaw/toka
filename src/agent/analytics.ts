import { AgentCostSummary, AgentContext, AgentStage } from './types';

export interface UsageRecordItem {
  agentContext?: AgentContext;
  model: string;
  cost: number;
  tokens?: number;
  success?: boolean;
  cacheHit?: boolean;
  timestamp?: number;
}

export class AgentAnalytics {
  private readonly records: UsageRecordItem[] = [];
  private readonly successfulTasks = new Set<string>();

  record(item: UsageRecordItem): void {
    this.records.push({
      ...item,
      timestamp: item.timestamp ?? Date.now(),
    });

    if (item.agentContext?.taskId && item.agentContext.taskSuccess === true) {
      this.successfulTasks.add(item.agentContext.taskId);
    }
  }

  markTaskSuccess(taskId: string): void {
    this.successfulTasks.add(taskId);
  }

  getRecords(): readonly UsageRecordItem[] {
    return this.records;
  }

  getCostByAgent(): Record<string, number>;
  getCostByAgent(agentId: string): number;
  getCostByAgent(agentId?: string): Record<string, number> | number {
    const map: Record<string, number> = {};
    for (const r of this.records) {
      const id = r.agentContext?.agentId ?? 'unspecified';
      map[id] = Number(((map[id] ?? 0) + r.cost).toFixed(8));
    }
    if (agentId !== undefined) {
      return map[agentId] ?? 0;
    }
    return map;
  }

  getCostByRepository(): Record<string, number>;
  getCostByRepository(repository: string): number;
  getCostByRepository(repository?: string): Record<string, number> | number {
    const map: Record<string, number> = {};
    for (const r of this.records) {
      const repo = r.agentContext?.repository ?? 'unspecified';
      map[repo] = Number(((map[repo] ?? 0) + r.cost).toFixed(8));
    }
    if (repository !== undefined) {
      return map[repository] ?? 0;
    }
    return map;
  }

  getCostByTask(): Record<string, number>;
  getCostByTask(taskId: string): number;
  getCostByTask(taskId?: string): Record<string, number> | number {
    const map: Record<string, number> = {};
    for (const r of this.records) {
      const id = r.agentContext?.taskId ?? 'unspecified';
      map[id] = Number(((map[id] ?? 0) + r.cost).toFixed(8));
    }
    if (taskId !== undefined) {
      return map[taskId] ?? 0;
    }
    return map;
  }

  getCostByStage(): Record<string, number>;
  getCostByStage(stage: AgentStage): number;
  getCostByStage(stage?: AgentStage): Record<string, number> | number {
    const map: Record<string, number> = {};
    for (const r of this.records) {
      const s = r.agentContext?.stage ?? 'unspecified';
      map[s] = Number(((map[s] ?? 0) + r.cost).toFixed(8));
    }
    if (stage !== undefined) {
      return map[stage] ?? 0;
    }
    return map;
  }

  getCostByModel(): Record<string, number>;
  getCostByModel(model: string): number;
  getCostByModel(model?: string): Record<string, number> | number {
    const map: Record<string, number> = {};
    for (const r of this.records) {
      const m = r.model ?? 'unspecified';
      map[m] = Number(((map[m] ?? 0) + r.cost).toFixed(8));
    }
    if (model !== undefined) {
      return map[model] ?? 0;
    }
    return map;
  }

  private findTop(map: Record<string, number>): { id: string; cost: number } | null {
    let topId: string | null = null;
    let maxCost = -1;
    for (const [id, cost] of Object.entries(map)) {
      if (id !== 'unspecified' && cost > maxCost) {
        maxCost = cost;
        topId = id;
      }
    }
    // If only 'unspecified' exists and has cost
    if (!topId && map['unspecified'] !== undefined && map['unspecified'] > 0) {
      return { id: 'unspecified', cost: map['unspecified'] };
    }
    return topId ? { id: topId, cost: maxCost } : null;
  }

  getTopSpenders(): {
    topAgent: { id: string; cost: number } | null;
    topRepository: { id: string; cost: number } | null;
    topTask: { id: string; cost: number } | null;
    topStage: { id: string; cost: number } | null;
    topModel: { id: string; cost: number } | null;
  } {
    return {
      topAgent: this.findTop(this.getCostByAgent()),
      topRepository: this.findTop(this.getCostByRepository()),
      topTask: this.findTop(this.getCostByTask()),
      topStage: this.findTop(this.getCostByStage()),
      topModel: this.findTop(this.getCostByModel()),
    };
  }

  getSummary(): AgentCostSummary {
    const costByAgent = this.getCostByAgent();
    const costByRepository = this.getCostByRepository();
    const costByTask = this.getCostByTask();
    const costByStage = this.getCostByStage();
    const costByModel = this.getCostByModel();

    let totalCost = 0;
    let totalTokens = 0;
    for (const r of this.records) {
      totalCost += r.cost;
      totalTokens += r.tokens ?? 0;
    }

    const tops = this.getTopSpenders();
    const successfulTaskCount = this.successfulTasks.size;
    const costPerSuccessfulTask =
      successfulTaskCount > 0 ? Number((totalCost / successfulTaskCount).toFixed(6)) : undefined;

    return {
      totalCost: Number(totalCost.toFixed(6)),
      totalRequests: this.records.length,
      totalTokens,
      costByAgent,
      costByRepository,
      costByTask,
      costByStage,
      costByModel,
      ...tops,
      costPerSuccessfulTask,
    };
  }

  reset(): void {
    this.records.length = 0;
    this.successfulTasks.clear();
  }
}
