import {
  Toka,
  TokaBudgetExceededError,
  TokaConfigurationError,
  TokaTimeoutError,
  TokaRateLimitError,
  AIProvider,
  ProviderRequest,
  ProviderResponse,
} from '../src';
import * as TokaExports from '../src';

class ControlledProvider implements AIProvider {
  readonly name = 'controlled-provider';
  public callCount = 0;
  public shouldFailWith?: Error;
  public responseText = 'Controlled response';
  public inputTokens = 100;
  public outputTokens = 50;

  async complete(_request: ProviderRequest): Promise<ProviderResponse> {
    this.callCount++;
    if (this.shouldFailWith) {
      throw this.shouldFailWith;
    }
    return {
      text: this.responseText,
      provider: this.name,
      modelUsed: _request.model,
      usage: {
        inputTokens: this.inputTokens,
        outputTokens: this.outputTokens,
        totalTokens: this.inputTokens + this.outputTokens,
        isEstimated: false,
      },
    };
  }
}

describe('Phase 3 Cost Control Engine', () => {
  // 1. per-request budget allows request under limit
  it('1. per-request budget allows request under limit', async () => {
    const toka = new Toka({
      models: ['gpt-4o-mini'],
      budgets: {
        perRequest: 0.1,
      },
      pricing: {
        'mock:gpt-4o-mini': {
          inputPricePerMillionTokens: 1,
          outputPricePerMillionTokens: 2,
        },
      },
    });

    const res = await toka.complete({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Short prompt' }],
    });

    expect(res.cost).toBeLessThan(0.1);
    expect(res.budgetDecision?.allowed).toBe(true);
  });

  // 2. per-request budget blocks request over limit
  it('2. per-request budget blocks request over limit', async () => {
    const toka = new Toka({
      models: ['demo'],
      budgets: {
        perRequest: 0.000001,
      },
    });

    await expect(
      toka.complete({
        model: 'demo',
        messages: [{ role: 'user', content: 'This prompt exceeds limit.' }],
      })
    ).rejects.toThrow(TokaBudgetExceededError);
  });

  // 3. per-task accumulation & 4. per-task blocking
  it('3 & 4. per-task accumulation and blocking', async () => {
    const provider = new ControlledProvider();
    provider.inputTokens = 1000;
    provider.outputTokens = 1000;
    const toka = new Toka(
      {
        models: ['custom'],
        budgets: {
          perTask: 0.025,
        },
        pricing: {
          'controlled-provider:custom': {
            inputPricePerMillionTokens: 10,
            outputPricePerMillionTokens: 10,
          },
        },
      },
      undefined,
      provider
    );

    // Request 1: ~0.02, total ~0.02 (allowed)
    await toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Hello 1' }],
      budgetContext: { taskId: 'task-A' },
      maxTokens: 1000,
    });

    // Request 2: proposed ~0.01002 + 0.02 spent > 0.025 limit -> BLOCKED!
    await expect(
      toka.complete({
        model: 'custom',
        messages: [{ role: 'user', content: 'Hello 2' }],
        budgetContext: { taskId: 'task-A' },
        maxTokens: 1000,
      })
    ).rejects.toThrow(TokaBudgetExceededError);

    // Verify provider was only called once
    expect(provider.callCount).toBe(1);
  });

  // 5. per-session accumulation & 6. per-session isolation
  it('5 & 6. per-session accumulation and session isolation', async () => {
    const provider = new ControlledProvider();
    provider.inputTokens = 1000;
    provider.outputTokens = 1000;
    const toka = new Toka(
      {
        models: ['custom'],
        budgets: {
          perSession: 0.03,
        },
        pricing: {
          'controlled-provider:custom': {
            inputPricePerMillionTokens: 10,
            outputPricePerMillionTokens: 10,
          },
        },
      },
      undefined,
      provider
    );

    // Session 1: 1st call (~0.02) succeeds
    await toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Prompt' }],
      budgetContext: { sessionId: 'session-1' },
      maxTokens: 1000,
    });

    // Session 2: 1st call (~0.02) succeeds because sessions are isolated
    await toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Prompt' }],
      budgetContext: { sessionId: 'session-2' },
      maxTokens: 1000,
    });

    // Session 1: 2nd call would push session-1 to ~0.04 > 0.03 -> BLOCKED!
    await expect(
      toka.complete({
        model: 'custom',
        messages: [{ role: 'user', content: 'Prompt' }],
        budgetContext: { sessionId: 'session-1' },
        maxTokens: 1000,
      })
    ).rejects.toThrow(TokaBudgetExceededError);

    // Session 3 (brand new) is unaffected
    await expect(
      toka.complete({
        model: 'custom',
        messages: [{ role: 'user', content: 'Prompt' }],
        budgetContext: { sessionId: 'session-3' },
        maxTokens: 1000,
      })
    ).resolves.toBeDefined();
  });

  // 7. daily accumulation & 8. daily reset
  it('7 & 8. daily accumulation and reset across calendar days', async () => {
    let fakeTime = new Date('2026-09-24T10:00:00Z');
    const clock = () => fakeTime;

    const provider = new ControlledProvider();
    provider.inputTokens = 1000;
    provider.outputTokens = 1000;

    const toka = new Toka(
      {
        models: ['custom'],
        budgets: {
          perDay: 0.03,
          timezone: 'UTC',
        },
        pricing: {
          'controlled-provider:custom': {
            inputPricePerMillionTokens: 10,
            outputPricePerMillionTokens: 10,
          },
        },
      },
      undefined,
      provider,
      undefined,
      clock
    );

    // Day 1: First call (~0.02) succeeds
    await toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Day 1 Req 1' }],
      maxTokens: 1000,
    });

    // Day 1: Second call would exceed daily limit (~0.04 > 0.03) -> BLOCKED
    await expect(
      toka.complete({
        model: 'custom',
        messages: [{ role: 'user', content: 'Day 1 Req 2' }],
        maxTokens: 1000,
      })
    ).rejects.toThrow(TokaBudgetExceededError);

    // Advance clock to Day 2 (2026-09-25)
    fakeTime = new Date('2026-09-25T01:00:00Z');

    // Day 2: Budget should logically reset without restart!
    const day2Res = await toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Day 2 Req 1' }],
      maxTokens: 1000,
    });
    expect(day2Res).toBeDefined();
  });

  // 9. monthly accumulation & 10. monthly reset
  it('9 & 10. monthly accumulation and reset across calendar months', async () => {
    let fakeTime = new Date('2026-09-30T23:00:00Z');
    const clock = () => fakeTime;

    const provider = new ControlledProvider();
    provider.inputTokens = 1000;
    provider.outputTokens = 1000;

    const toka = new Toka(
      {
        models: ['custom'],
        budgets: {
          perMonth: 0.03,
          timezone: 'UTC',
        },
        pricing: {
          'controlled-provider:custom': {
            inputPricePerMillionTokens: 10,
            outputPricePerMillionTokens: 10,
          },
        },
      },
      undefined,
      provider,
      undefined,
      clock
    );

    // September call 1: ~0.02 succeeds
    await toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Sept 1' }],
      maxTokens: 1000,
    });

    // September call 2: exceeds monthly limit 0.03 -> BLOCKED
    await expect(
      toka.complete({
        model: 'custom',
        messages: [{ role: 'user', content: 'Sept 2' }],
        maxTokens: 1000,
      })
    ).rejects.toThrow(TokaBudgetExceededError);

    // Advance clock to October 1st
    fakeTime = new Date('2026-10-01T00:30:00Z');

    // October: Monthly budget has logically reset!
    const octRes = await toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Oct 1' }],
      maxTokens: 1000,
    });
    expect(octRes).toBeDefined();
  });

  // 11. warn action
  it('11. warn action allows request and provides structured warning', async () => {
    const toka = new Toka({
      models: ['demo'],
      budgets: {
        perRequest: {
          limit: 0.000001,
          action: 'warn',
        },
      },
    });

    const res = await toka.complete({
      model: 'demo',
      messages: [{ role: 'user', content: 'Exceeds budget with warning' }],
    });

    expect(res).toBeDefined();
    expect(res.budgetWarning).toBeDefined();
    expect(res.budgetWarning?.scope).toBe('request');
    expect(res.budgetDecision?.action).toBe('warn');
    expect(res.budgetDecision?.allowed).toBe(true);
  });

  // 12. block action
  it('12. block action prevents execution and throws TokaBudgetExceededError', async () => {
    const toka = new Toka({
      models: ['demo'],
      budgets: {
        perRequest: {
          limit: 0.000001,
          action: 'block',
        },
      },
    });

    await expect(
      toka.complete({
        model: 'demo',
        messages: [{ role: 'user', content: 'Blocked prompt' }],
      })
    ).rejects.toThrow(TokaBudgetExceededError);
  });

  // 13. fallback decision
  it('13. fallback decision exposes recommended fallback model', async () => {
    const toka = new Toka({
      models: ['gpt-4', 'gpt-3.5-turbo'],
      budgets: {
        perRequest: {
          limit: 0.000001,
          action: 'fallback',
        },
      },
    });

    let thrownError: unknown;
    try {
      await toka.complete({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Fallback check' }],
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(TokaBudgetExceededError);
    const budgetErr = thrownError as TokaBudgetExceededError;
    expect(budgetErr.action).toBe('fallback');
    expect(budgetErr.decision?.fallback?.recommendedModel).toBe(
      'gpt-3.5-turbo'
    );
  });

  // 14. approval-required decision
  it('14. approval-required decision gates expensive requests until explicit approval', async () => {
    const provider = new ControlledProvider();
    provider.inputTokens = 1000;
    provider.outputTokens = 1000;

    const toka = new Toka(
      {
        models: ['custom'],
        budgets: {
          perRequest: 1.0,
          approvalRequiredAbove: 0.015,
        },
        pricing: {
          'controlled-provider:custom': {
            inputPricePerMillionTokens: 10,
            outputPricePerMillionTokens: 10,
          },
        },
      },
      undefined,
      provider
    );

    // Call without approval: estimated ~0.02 > 0.015 threshold -> approval_required!
    let thrownError: unknown;
    try {
      await toka.complete({
        model: 'custom',
        messages: [{ role: 'user', content: 'Expensive task' }],
        maxTokens: 1500,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(TokaBudgetExceededError);
    const budgetErr = thrownError as TokaBudgetExceededError;
    expect(budgetErr.action).toBe('approval_required');
    expect(budgetErr.decision?.approval?.required).toBe(true);
    expect(budgetErr.decision?.approval?.threshold).toBe(0.015);

    // Provider should NOT have been called
    expect(provider.callCount).toBe(0);

    // Resubmit with explicit approved: true
    const approvedRes = await toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Expensive task' }],
      maxTokens: 1500,
      budgetContext: { approved: true },
    });
    expect(approvedRes).toBeDefined();
    expect(provider.callCount).toBe(1);
  });

  // 15. TokaBudgetExceededError structure
  it('15. TokaBudgetExceededError exposes typed structured fields', async () => {
    const toka = new Toka({
      models: ['demo'],
      budgets: {
        perTask: 0.000001,
      },
    });

    let thrownError: unknown;
    try {
      await toka.complete({
        model: 'demo',
        messages: [{ role: 'user', content: 'Prompt exceeding task' }],
        budgetContext: { taskId: 'task-xyz' },
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(TokaBudgetExceededError);
    const e = thrownError as TokaBudgetExceededError;
    expect(e.code).toBe('BUDGET_EXCEEDED');
    expect(e.scope).toBe('task');
    expect(typeof e.limit).toBe('number');
    expect(typeof e.spent).toBe('number');
    expect(typeof e.remaining).toBe('number');
    expect(typeof e.requestedCost).toBe('number');
    expect(e.action).toBe('block');
    expect(e.decision).toBeDefined();
  });

  // 16. remaining-budget calculation & inspection API
  it('16. remaining-budget calculation and getBudgetStatus', async () => {
    const provider = new ControlledProvider();
    const toka = new Toka(
      {
        models: ['custom'],
        budgets: {
          perRequest: 0.5,
          perTask: 1.0,
          perDay: 10.0,
        },
        pricing: {
          'controlled-provider:custom': {
            inputPricePerMillionTokens: 10,
            outputPricePerMillionTokens: 10,
          },
        },
      },
      undefined,
      provider
    );

    await toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Hello' }],
      budgetContext: { taskId: 'task-inspect' },
    });

    const status = await toka.getBudgetStatus({ taskId: 'task-inspect' });
    expect(status.limits.task?.limit).toBe(1.0);
    expect(status.limits.task?.spent).toBe(0.0015);
    expect(status.limits.task?.remaining).toBeCloseTo(0.9985, 4);
    expect(status.blockedScopes).toHaveLength(0);
  });

  // 17. multiple simultaneous limits & 18. most restrictive applicable limit
  it('17 & 18. multiple simultaneous limits identify the most restrictive limit', async () => {
    const toka = new Toka({
      models: ['demo'],
      budgets: {
        perRequest: 1.0,
        perTask: 0.000001, // Most restrictive!
        perDay: 50.0,
      },
    });

    let thrownError: unknown;
    try {
      await toka.complete({
        model: 'demo',
        messages: [{ role: 'user', content: 'Prompt' }],
        budgetContext: { taskId: 'task-tight' },
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(TokaBudgetExceededError);
    const e = thrownError as TokaBudgetExceededError;
    expect(e.scope).toBe('task');
    expect(e.limit).toBe(0.000001);
  });

  // 19. successful request accounting
  it('19. successful request updates spending counters accurately', async () => {
    const provider = new ControlledProvider();
    const toka = new Toka(
      {
        models: ['custom'],
        budgets: {
          perTask: 1.0,
        },
        pricing: {
          'controlled-provider:custom': {
            inputPricePerMillionTokens: 10,
            outputPricePerMillionTokens: 10,
          },
        },
      },
      undefined,
      provider
    );

    const res = await toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Task 1' }],
      budgetContext: { taskId: 'task-count' },
    });

    const status = await toka.getBudgetStatus({ taskId: 'task-count' });
    expect(status.limits.task?.spent).toBe(res.cost);
  });

  // 20. failed provider request accounting (releases reservation without charging)
  it('20. failed provider request releases reservation and does not count as spent', async () => {
    const provider = new ControlledProvider();
    provider.shouldFailWith = new Error('Provider exploded');

    const toka = new Toka(
      {
        models: ['custom'],
        budgets: {
          perTask: 0.05,
        },
        pricing: {
          'controlled-provider:custom': {
            inputPricePerMillionTokens: 10,
            outputPricePerMillionTokens: 10,
          },
        },
      },
      undefined,
      provider
    );

    await expect(
      toka.complete({
        model: 'custom',
        messages: [{ role: 'user', content: 'Explode' }],
        budgetContext: { taskId: 'task-fail' },
      })
    ).rejects.toThrow('Provider completion failed.');

    const status = await toka.getBudgetStatus({ taskId: 'task-fail' });
    expect(status.limits.task?.spent).toBe(0);
  });

  // 21. timeout behavior
  it('21. timeout releases budget reservation without charging', async () => {
    const provider = new ControlledProvider();
    provider.shouldFailWith = new TokaTimeoutError(
      'The provider request timed out.'
    );

    const toka = new Toka(
      {
        models: ['custom'],
        budgets: {
          perTask: 0.05,
        },
        pricing: {
          'controlled-provider:custom': {
            inputPricePerMillionTokens: 10,
            outputPricePerMillionTokens: 10,
          },
        },
      },
      undefined,
      provider
    );

    await expect(
      toka.complete({
        model: 'custom',
        messages: [{ role: 'user', content: 'Timeout' }],
        budgetContext: { taskId: 'task-timeout' },
      })
    ).rejects.toThrow(TokaTimeoutError);

    const status = await toka.getBudgetStatus({ taskId: 'task-timeout' });
    expect(status.limits.task?.spent).toBe(0);
  });

  // 22. rate-limit behavior
  it('22. rate limit error releases budget reservation without charging', async () => {
    const provider = new ControlledProvider();
    provider.shouldFailWith = new TokaRateLimitError(
      'controlled-provider',
      'custom',
      1000
    );

    const toka = new Toka(
      {
        models: ['custom'],
        budgets: {
          perTask: 0.05,
        },
        pricing: {
          'controlled-provider:custom': {
            inputPricePerMillionTokens: 10,
            outputPricePerMillionTokens: 10,
          },
        },
      },
      undefined,
      provider
    );

    await expect(
      toka.complete({
        model: 'custom',
        messages: [{ role: 'user', content: 'Rate limited' }],
        budgetContext: { taskId: 'task-ratelimit' },
      })
    ).rejects.toThrow(TokaRateLimitError);

    const status = await toka.getBudgetStatus({ taskId: 'task-ratelimit' });
    expect(status.limits.task?.spent).toBe(0);
  });

  // 23. concurrent requests synchronization
  it('23. concurrent requests do not exceed budget due to race conditions', async () => {
    class DelayedProvider implements AIProvider {
      readonly name = 'delayed';
      async complete(request: ProviderRequest): Promise<ProviderResponse> {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          text: 'Delayed result',
          provider: 'delayed',
          modelUsed: request.model,
          usage: {
            inputTokens: 1000,
            outputTokens: 1000,
            totalTokens: 2000,
            isEstimated: false,
          },
        };
      }
    }

    // Budget: 0.015. With maxTokens: 1000 and price 10/10, estimated cost is ~0.01002.
    // Two concurrent requests: only ONE can reserve 0.01002 under 0.015 limit; the second should be blocked!
    const toka = new Toka(
      {
        models: ['custom'],
        budgets: {
          perTask: 0.015,
        },
        pricing: {
          'delayed:custom': {
            inputPricePerMillionTokens: 10,
            outputPricePerMillionTokens: 10,
          },
        },
      },
      undefined,
      new DelayedProvider()
    );

    const req1 = toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Req 1' }],
      maxTokens: 1000,
      budgetContext: { taskId: 'concurrent-task' },
    });
    const req2 = toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Req 2' }],
      maxTokens: 1000,
      budgetContext: { taskId: 'concurrent-task' },
    });

    const results = await Promise.allSettled([req1, req2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });

  // 24. zero budget
  it('24. zero budget blocks requests with non-zero cost', async () => {
    const toka = new Toka({
      models: ['demo'],
      budgets: {
        perRequest: 0,
      },
    });

    await expect(
      toka.complete({
        model: 'demo',
        messages: [{ role: 'user', content: 'Prompt' }],
      })
    ).rejects.toThrow(TokaBudgetExceededError);
  });

  // 25. zero-cost request
  it('25. zero-cost request succeeds under zero or minimal budget', async () => {
    const toka = new Toka({
      models: ['demo'],
      budgets: {
        perRequest: 0,
      },
      pricing: {
        'mock:demo': {
          inputPricePerMillionTokens: 0,
          outputPricePerMillionTokens: 0,
        },
      },
    });

    const res = await toka.complete({
      model: 'demo',
      messages: [{ role: 'user', content: 'Zero cost test' }],
    });
    expect(res).toBeDefined();
    expect(res.cost).toBe(0);
  });

  // 26. very small monetary values
  it('26. handles micro-dollar fractional monetary values without precision drift', async () => {
    const toka = new Toka({
      models: ['custom'],
      budgets: {
        perRequest: 0.0000005,
      },
      pricing: {
        'mock:custom': {
          inputPricePerMillionTokens: 0.001,
          outputPricePerMillionTokens: 0.001,
        },
      },
    });

    const res = await toka.complete({
      model: 'custom',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(res.cost).toBeLessThanOrEqual(0.0000005);
  });

  // 27. malformed budget configuration rejected
  it('27. rejects malformed budget configuration', () => {
    expect(
      () =>
        new Toka({
          models: ['demo'],
          budgets: 'invalid' as unknown as Record<string, unknown>,
        })
    ).toThrow(TokaConfigurationError);

    expect(
      () =>
        new Toka({
          models: ['demo'],
          budgets: {
            perRequest: { limit: 10, action: 'destroy' as unknown as 'block' },
          },
        })
    ).toThrow(TokaConfigurationError);
  });

  // 28. negative budgets rejected
  it('28. rejects negative budget limits', () => {
    expect(
      () =>
        new Toka({
          models: ['demo'],
          budgets: {
            perRequest: -5,
          },
        })
    ).toThrow(TokaConfigurationError);
  });

  // 29. NaN/infinite budgets rejected
  it('29. rejects NaN and infinite budget limits', () => {
    expect(
      () =>
        new Toka({
          models: ['demo'],
          budgets: {
            perRequest: NaN,
          },
        })
    ).toThrow(TokaConfigurationError);

    expect(
      () =>
        new Toka({
          models: ['demo'],
          budgets: {
            perDay: Infinity,
          },
        })
    ).toThrow(TokaConfigurationError);

    expect(
      () =>
        new Toka({
          models: ['demo'],
          budgets: {
            approvalRequiredAbove: -1,
          },
        })
    ).toThrow(TokaConfigurationError);
  });

  // 30. backward compatibility with maxCostPerRequest
  it('30. supports backward-compatible maxCostPerRequest without budgets object', async () => {
    const toka = new Toka({
      models: ['demo'],
      maxCostPerRequest: 0.000001,
    });

    await expect(
      toka.complete({
        model: 'demo',
        messages: [{ role: 'user', content: 'A long prompt exceeding budget' }],
      })
    ).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });
  });

  // 31. public exports
  it('31. exports all required Phase 3 classes, types, and functions from package entry', () => {
    expect(TokaExports.Toka).toBeDefined();
    expect(TokaExports.BudgetManager).toBeDefined();
    expect(TokaExports.InMemoryBudgetStore).toBeDefined();
    expect(TokaExports.roundCost).toBeDefined();
    expect(TokaExports.TokaBudgetExceededError).toBeDefined();
    expect(TokaExports.validateBudgetPolicy).toBeDefined();
  });

  // 32. evaluateBudget pre-check API
  it('32. evaluateBudget inspects request without calling provider', async () => {
    const provider = new ControlledProvider();
    const toka = new Toka(
      {
        models: ['custom'],
        budgets: {
          perRequest: 0.01,
        },
        pricing: {
          'controlled-provider:custom': {
            inputPricePerMillionTokens: 10,
            outputPricePerMillionTokens: 10,
          },
        },
      },
      undefined,
      provider
    );

    const decision = await toka.evaluateBudget({
      model: 'custom',
      messages: [{ role: 'user', content: 'Long prompt for evaluation' }],
    });

    expect(decision).toBeDefined();
    expect(decision.estimatedCost).toBeGreaterThan(0);
    // Provider MUST not be invoked during evaluateBudget
    expect(provider.callCount).toBe(0);
  });
});
