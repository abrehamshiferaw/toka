import { Toka, MockProvider, AgentAnalytics, AgentStage } from '../src';

describe('Phase 5: Agent-Aware Toka', () => {
  it('records and queries costs across agent dimensions', () => {
    const analytics = new AgentAnalytics();

    analytics.record({
      agentContext: {
        agentId: 'coder-bot',
        sessionId: 'session-1',
        taskId: 'task-100',
        stage: 'discovery',
        repository: 'owner/repoA',
      },
      model: 'gpt-4o',
      cost: 0.05,
      tokens: 1000,
      success: true,
    });

    analytics.record({
      agentContext: {
        agentId: 'coder-bot',
        sessionId: 'session-1',
        taskId: 'task-100',
        stage: 'generation',
        repository: 'owner/repoA',
      },
      model: 'gpt-4o-mini',
      cost: 0.01,
      tokens: 500,
      success: true,
    });

    analytics.record({
      agentContext: {
        agentId: 'reviewer-bot',
        sessionId: 'session-2',
        taskId: 'task-200',
        stage: 'review',
        repository: 'owner/repoB',
      },
      model: 'gpt-4o',
      cost: 0.08,
      tokens: 2000,
      success: true,
    });

    // Query cost by agent
    expect(analytics.getCostByAgent('coder-bot')).toBe(0.06);
    expect(analytics.getCostByAgent('reviewer-bot')).toBe(0.08);

    // Query cost by repository
    expect(analytics.getCostByRepository('owner/repoA')).toBe(0.06);
    expect(analytics.getCostByRepository('owner/repoB')).toBe(0.08);

    // Query cost by stage
    expect(analytics.getCostByStage('discovery')).toBe(0.05);
    expect(analytics.getCostByStage('generation')).toBe(0.01);
    expect(analytics.getCostByStage('review')).toBe(0.08);

    // Identifies top spenders
    const topSpenders = analytics.getTopSpenders();
    expect(topSpenders.topAgent?.id).toBe('reviewer-bot');
    expect(topSpenders.topRepository?.id).toBe('owner/repoB');
    expect(topSpenders.topStage?.id).toBe('review');
    expect(topSpenders.topModel?.id).toBe('gpt-4o');
  });

  it('calculates cost per successful task accurately', () => {
    const analytics = new AgentAnalytics();

    analytics.record({
      agentContext: { taskId: 'task-1', taskSuccess: true },
      model: 'gpt-4o',
      cost: 0.10,
    });

    analytics.record({
      agentContext: { taskId: 'task-2', taskSuccess: false },
      model: 'gpt-4o',
      cost: 0.05,
    });

    analytics.record({
      agentContext: { taskId: 'task-2' }, // retry
      model: 'gpt-4o',
      cost: 0.05,
    });
    analytics.markTaskSuccess('task-2'); // now succeeds

    const summary = analytics.getSummary();
    // Total spent: 0.20, Successful tasks: 2 (task-1 and task-2)
    expect(summary.totalCost).toBe(0.20);
    expect(summary.costPerSuccessfulTask).toBe(0.10);
  });

  it('integrates seamlessly with Toka.complete and passes agentContext', async () => {
    const toka = new Toka(
      { models: ['demo'], maxCostPerRequest: 1.0 },
      undefined,
      new MockProvider()
    );

    const stages: AgentStage[] = [
      'classification',
      'discovery',
      'planning',
      'generation',
      'testing',
      'debugging',
      'review',
      'final-response',
    ];

    for (const stage of stages) {
      const res = await toka.complete({
        model: 'demo',
        messages: [{ role: 'user', content: `Task in stage ${stage}` }],
        agentContext: {
          agentId: 'autonomous-swe',
          repository: 'org/frontend',
          commitSha: 'a1b2c3d4e5f6',
          taskId: 'issue-42',
          stage,
          toolName: 'readFile',
        },
      });

      expect(res.agentContext?.stage).toBe(stage);
      expect(res.agentContext?.repository).toBe('org/frontend');
      expect(res.agentContext?.toolName).toBe('readFile');
    }

    expect(toka.getCostByAgent('autonomous-swe')).toBeGreaterThan(0);
    expect(toka.getCostByRepository('org/frontend')).toBeGreaterThan(0);
    expect(toka.getCostByTask('issue-42')).toBeGreaterThan(0);
    expect(toka.getCostByStage('generation')).toBeGreaterThan(0);

    const summary = toka.getAgentSummary();
    expect(summary.totalRequests).toBe(8);
    expect(summary.topAgent?.id).toBe('autonomous-swe');
  });
});
