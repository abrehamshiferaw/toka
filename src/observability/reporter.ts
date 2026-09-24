import { CostReport, ReportFilter, UsageEvent } from './types';

export class CostReporter {
  static filterEvents(
    events: readonly UsageEvent[],
    filter?: ReportFilter
  ): UsageEvent[] {
    if (!filter) return [...events];

    return events.filter((ev) => {
      if (filter.fromDate) {
        const from = new Date(filter.fromDate).getTime();
        if (new Date(ev.timestamp).getTime() < from) return false;
      }
      if (filter.toDate) {
        const to = new Date(filter.toDate).getTime();
        if (new Date(ev.timestamp).getTime() > to) return false;
      }
      if (filter.agentId && ev.agentContext?.agentId !== filter.agentId) {
        return false;
      }
      if (filter.repository && ev.agentContext?.repository !== filter.repository) {
        return false;
      }
      if (filter.taskId && ev.agentContext?.taskId !== filter.taskId) {
        return false;
      }
      if (filter.stage && ev.agentContext?.stage !== filter.stage) {
        return false;
      }
      if (filter.model && ev.actualModel !== filter.model && ev.model !== filter.model) {
        return false;
      }
      if (filter.provider && ev.provider !== filter.provider) {
        return false;
      }
      return true;
    });
  }

  static generateReport(
    allEvents: readonly UsageEvent[],
    filter?: ReportFilter
  ): CostReport {
    const events = this.filterEvents(allEvents, filter);

    let totalCost = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let cacheHits = 0;
    let fallbacks = 0;
    let retries = 0;

    const byTask: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    const byRepository: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    const byStage: Record<string, number> = {};
    const successfulTasks = new Set<string>();

    for (const ev of events) {
      const cost = ev.cost.totalCost;
      totalCost += cost;
      inputTokens += ev.tokens.input;
      outputTokens += ev.tokens.output;
      totalTokens += ev.tokens.total;

      if (ev.success) {
        successfulRequests++;
      } else {
        failedRequests++;
      }

      if (ev.cacheHit) cacheHits++;
      if (ev.fallbackOccurred) fallbacks++;
      if (ev.fallbackAttempts && ev.fallbackAttempts > 0) retries += ev.fallbackAttempts;

      const taskId = ev.agentContext?.taskId ?? 'unspecified';
      byTask[taskId] = Number(((byTask[taskId] ?? 0) + cost).toFixed(8));

      const agentId = ev.agentContext?.agentId ?? 'unspecified';
      byAgent[agentId] = Number(((byAgent[agentId] ?? 0) + cost).toFixed(8));

      const repo = ev.agentContext?.repository ?? 'unspecified';
      byRepository[repo] = Number(((byRepository[repo] ?? 0) + cost).toFixed(8));

      const model = ev.actualModel ?? ev.model;
      byModel[model] = Number(((byModel[model] ?? 0) + cost).toFixed(8));

      const stage = ev.agentContext?.stage ?? 'unspecified';
      byStage[stage] = Number(((byStage[stage] ?? 0) + cost).toFixed(8));

      if (ev.agentContext?.taskId && (ev.agentContext.taskSuccess === true || (ev.success && ev.agentContext.stage === 'final-response'))) {
        successfulTasks.add(ev.agentContext.taskId);
      }
    }

    const totalRequests = events.length;
    const averageCostPerRequest =
      totalRequests > 0 ? Number((totalCost / totalRequests).toFixed(6)) : 0;
    const cacheHitRate =
      totalRequests > 0 ? Number((cacheHits / totalRequests).toFixed(4)) : 0;
    const fallbackRate =
      totalRequests > 0 ? Number((fallbacks / totalRequests).toFixed(4)) : 0;
    const retryRate =
      totalRequests > 0 ? Number((retries / totalRequests).toFixed(4)) : 0;

    const successfulTaskCount = successfulTasks.size;
    const costPerSuccessfulTask =
      successfulTaskCount > 0
        ? Number((totalCost / successfulTaskCount).toFixed(6))
        : Number(totalCost.toFixed(6));

    return {
      summary: {
        totalCost: Number(totalCost.toFixed(6)),
        totalRequests,
        successfulRequests,
        failedRequests,
        totalTokens: {
          input: inputTokens,
          output: outputTokens,
          total: totalTokens,
        },
        averageCostPerRequest,
        cacheHitRate,
        fallbackRate,
        retryRate,
        costPerSuccessfulTask,
      },
      byTask,
      byAgent,
      byRepository,
      byModel,
      byStage,
      events,
    };
  }

  static exportJson(events: readonly UsageEvent[], filter?: ReportFilter): string {
    const report = this.generateReport(events, filter);
    return JSON.stringify(report, null, 2);
  }

  static exportCsv(events: readonly UsageEvent[], filter?: ReportFilter): string {
    const filtered = this.filterEvents(events, filter);
    const headers = [
      'id',
      'timestamp',
      'provider',
      'requested_model',
      'actual_model',
      'input_tokens',
      'output_tokens',
      'total_tokens',
      'cost_usd',
      'cost_source',
      'latency_ms',
      'cache_hit',
      'fallback',
      'success',
      'agent_id',
      'task_id',
      'stage',
      'repository',
    ];

    const escape = (val: unknown): string => {
      if (val === undefined || val === null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = filtered.map((e) =>
      [
        e.id,
        e.timestamp,
        e.provider,
        e.requestedModel,
        e.actualModel,
        e.tokens.input,
        e.tokens.output,
        e.tokens.total,
        e.cost.totalCost.toFixed(6),
        e.costSource,
        e.latencyMs,
        e.cacheHit ? 'true' : 'false',
        e.fallbackOccurred ? 'true' : 'false',
        e.success ? 'true' : 'false',
        e.agentContext?.agentId,
        e.agentContext?.taskId,
        e.agentContext?.stage,
        e.agentContext?.repository,
      ]
        .map(escape)
        .join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  static formatTerminalTable(report: CostReport): string {
    const lines: string[] = [];
    lines.push('====================================================');
    lines.push('               TOKA COST REPORT                     ');
    lines.push('====================================================');
    lines.push(`Total Requests:         ${report.summary.totalRequests}`);
    lines.push(`Total Cost:             $${report.summary.totalCost.toFixed(6)}`);
    lines.push(`Avg Cost / Request:     $${report.summary.averageCostPerRequest.toFixed(6)}`);
    lines.push(`Cost / Successful Task: $${report.summary.costPerSuccessfulTask.toFixed(6)}`);
    lines.push(`Cache Hit Rate:         ${(report.summary.cacheHitRate * 100).toFixed(1)}%`);
    lines.push(`Fallback Rate:          ${(report.summary.fallbackRate * 100).toFixed(1)}%`);
    lines.push(`Total Tokens:           ${report.summary.totalTokens.total.toLocaleString()} (${report.summary.totalTokens.input.toLocaleString()} in / ${report.summary.totalTokens.output.toLocaleString()} out)`);
    lines.push('----------------------------------------------------');
    lines.push('Cost by Model:');
    for (const [model, cost] of Object.entries(report.byModel)) {
      lines.push(`  - ${model.padEnd(20)}: $${cost.toFixed(6)}`);
    }
    if (Object.keys(report.byStage).some((s) => s !== 'unspecified')) {
      lines.push('Cost by Stage:');
      for (const [stage, cost] of Object.entries(report.byStage)) {
        if (stage !== 'unspecified') {
          lines.push(`  - ${stage.padEnd(20)}: $${cost.toFixed(6)}`);
        }
      }
    }
    if (Object.keys(report.byAgent).some((a) => a !== 'unspecified')) {
      lines.push('Cost by Agent:');
      for (const [agent, cost] of Object.entries(report.byAgent)) {
        if (agent !== 'unspecified') {
          lines.push(`  - ${agent.padEnd(20)}: $${cost.toFixed(6)}`);
        }
      }
    }
    lines.push('====================================================');
    return lines.join('\n');
  }
}
