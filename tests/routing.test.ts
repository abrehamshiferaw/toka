import {
  defaultModelRegistry,
  ModelRegistry,
  ModelRouter,
  Toka,
  MockProvider,
} from '../src';

describe('Phase 4: Smart Model Routing', () => {
  it('loads built-in model metadata with pricing, tier, capabilities, and context limits', () => {
    const gpt4o = defaultModelRegistry.get('gpt-4o');
    expect(gpt4o).toBeDefined();
    expect(gpt4o?.qualityTier).toBe('flagship');
    expect(gpt4o?.capabilities).toContain('code');
    expect(gpt4o?.capabilities).toContain('tools');
    expect(gpt4o?.contextLimits.maxContextTokens).toBe(128000);
    expect(gpt4o?.pricing.inputCostPerThousand).toBeGreaterThan(0);
    expect(gpt4o?.pricing.outputCostPerThousand).toBeGreaterThan(0);

    const mini = defaultModelRegistry.get('gpt-4o-mini');
    expect(mini).toBeDefined();
    expect(mini?.qualityTier).toBe('fast');
  });

  it('allows registering and querying custom model metadata', () => {
    const registry = new ModelRegistry([]);
    registry.register({
      provider: 'custom-provider',
      model: 'custom-coder',
      name: 'Custom Coder v1',
      qualityTier: 'standard',
      capabilities: ['code', 'tools'],
      pricing: {
        inputCostPerThousand: 0.001,
        outputCostPerThousand: 0.002,
      },
      contextLimits: {
        maxContextTokens: 64000,
        maxOutputTokens: 4096,
      },
    });

    expect(registry.has('custom-coder')).toBe(true);
    expect(registry.findByCapability('code')).toHaveLength(1);
    expect(registry.findByTier('standard')).toHaveLength(1);
  });

  describe('Routing Policies', () => {
    const router = new ModelRouter(defaultModelRegistry);

    it('strict-model policy never substitutes the requested model', () => {
      const decision = router.route(
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'hello' }],
        },
        { policy: 'strict-model' }
      );

      expect(decision.policy).toBe('strict-model');
      expect(decision.requestedModel).toBe('gpt-4o');
      expect(decision.actualModel).toBe('gpt-4o');
      expect(decision.changed).toBe(false);
      expect(decision.estimatedSavings).toBe(0);
      expect(decision.reason).toContain('Strict model policy');
    });

    it('cheapest policy routes to the lowest cost candidate meeting capabilities', () => {
      const decision = router.route(
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Generate code snippet' }],
        },
        { policy: 'cheapest', allowedModels: ['gpt-4o', 'gpt-4o-mini'] }
      );

      expect(decision.policy).toBe('cheapest');
      expect(decision.requestedModel).toBe('gpt-4o');
      expect(decision.actualModel).toBe('gpt-4o-mini');
      expect(decision.changed).toBe(true);
      expect(decision.estimatedSavings).toBeGreaterThan(0);
      expect(decision.reason).toContain('Estimated savings');
    });

    it('balanced policy selects optimal standard/fast tier model rather than extreme economy', () => {
      const decision = router.route(
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Analyze this code' }],
        },
        { policy: 'balanced', allowedModels: ['gpt-4o', 'gpt-4.1-mini', 'gpt-4.1-nano'] }
      );

      expect(decision.policy).toBe('balanced');
      expect(decision.actualModel).toBe('gpt-4.1-mini');
      expect(decision.changed).toBe(true);
    });

    it('quality-first policy prioritizes flagship tier models', () => {
      const decision = router.route(
        {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Proof of mathematical theorem' }],
        },
        { policy: 'quality-first', allowedModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1'] }
      );

      expect(decision.policy).toBe('quality-first');
      expect(['gpt-4o', 'gpt-4.1']).toContain(decision.actualModel);
      expect(decision.modelMetadata?.qualityTier).toBe('flagship');
    });

    it('enforces tool capability requirement if request contains tools', () => {
      const customRegistry = new ModelRegistry([]);
      customRegistry.register({
        provider: 'mock',
        model: 'cheap-no-tools',
        qualityTier: 'economy',
        capabilities: ['chat'],
        pricing: { inputCostPerThousand: 0.00001, outputCostPerThousand: 0.00002 },
        contextLimits: { maxContextTokens: 8000, maxOutputTokens: 2000 },
      });
      customRegistry.register({
        provider: 'mock',
        model: 'capable-with-tools',
        qualityTier: 'standard',
        capabilities: ['chat', 'tools'],
        pricing: { inputCostPerThousand: 0.0005, outputCostPerThousand: 0.001 },
        contextLimits: { maxContextTokens: 8000, maxOutputTokens: 2000 },
      });

      const toolRouter = new ModelRouter(customRegistry, 'cheapest');
      const decision = toolRouter.route({
        model: 'capable-with-tools',
        messages: [{ role: 'user', content: 'use a tool' }],
        tools: [{ name: 'calculator' }],
      });

      // Cannot route to cheap-no-tools because it lacks 'tools' capability
      expect(decision.actualModel).toBe('capable-with-tools');
    });
  });

  describe('Toka Client Integration', () => {
    it('executes routed model and includes explainable routingDecision in response', async () => {
      let routedEventEmitted = false;
      const toka = new Toka(
        {
          models: ['gpt-4o', 'gpt-4o-mini'],
          maxCostPerRequest: 1.0,
        },
        undefined,
        new MockProvider()
      );

      toka.on('routing', (decision) => {
        routedEventEmitted = true;
        expect(decision.changed).toBe(true);
      });

      const res = await toka.complete({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Write a quick function' }],
        routing: 'cheapest',
      });

      expect(res.routingDecision).toBeDefined();
      expect(res.routingDecision?.requestedModel).toBe('gpt-4o');
      expect(res.routingDecision?.actualModel).toBe('gpt-4o-mini');
      expect(res.routingDecision?.changed).toBe(true);
      expect(res.routingDecision?.estimatedSavings).toBeGreaterThan(0);
      expect(res.modelUsed).toBe('gpt-4o-mini');
      expect(routedEventEmitted).toBe(true);
    });
  });
});
