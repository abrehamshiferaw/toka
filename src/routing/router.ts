import { ModelRegistry, defaultModelRegistry } from './registry';
import {
  ModelCapability,
  ModelMetadata,
  QualityTier,
  RoutingDecision,
  RoutingPolicy,
  RoutingRequirements,
} from './types';
import { SDKRequest, getMessageText } from '../types';

export interface RouteOptions {
  policy?: RoutingPolicy;
  requirements?: RoutingRequirements;
  allowedModels?: string[];
  provider?: string;
}

const TIER_RANK: Record<QualityTier, number> = {
  flagship: 4,
  standard: 3,
  fast: 2,
  economy: 1,
};

export class ModelRouter {
  private readonly registry: ModelRegistry;
  private readonly defaultPolicy: RoutingPolicy;

  constructor(
    registry: ModelRegistry = defaultModelRegistry,
    defaultPolicy: RoutingPolicy = 'strict-model'
  ) {
    this.registry = registry;
    this.defaultPolicy = defaultPolicy;
  }

  getRegistry(): ModelRegistry {
    return this.registry;
  }

  estimateTokens(request: SDKRequest): {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } {
    const text = getMessageText(request.messages);
    const inputTokens = text.length > 0 ? Math.max(1, Math.ceil(text.length / 4)) : 0;
    const outputTokens = request.maxTokens ?? Math.max(1, Math.ceil(inputTokens / 2));
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }

  estimateCostForModel(
    modelMeta: ModelMetadata,
    inputTokens: number,
    outputTokens: number
  ): number {
    const inputK = inputTokens / 1000;
    const outputK = outputTokens / 1000;
    const cost =
      inputK * modelMeta.pricing.inputCostPerThousand +
      outputK * modelMeta.pricing.outputCostPerThousand;
    return Number(cost.toFixed(8));
  }

  route(
    request: SDKRequest,
    options: RouteOptions = {}
  ): RoutingDecision {
    const policy = options.policy ?? this.defaultPolicy;
    const requestedModel = request.model;
    const provider = options.provider;

    const { inputTokens, outputTokens, totalTokens } = this.estimateTokens(request);
    const requestedMeta = this.registry.get(requestedModel, provider);
    const effectiveProvider = requestedMeta?.provider ?? provider;

    const requestedCost = requestedMeta
      ? this.estimateCostForModel(requestedMeta, inputTokens, outputTokens)
      : 0;

    // Strict model policy: Never change the requested model
    if (policy === 'strict-model') {
      return {
        requestedModel,
        actualModel: requestedModel,
        policy,
        reason:
          "Strict model policy enforced; no model substitution permitted to guarantee requested model execution.",
        estimatedCost: requestedCost,
        estimatedSavings: 0,
        changed: false,
        modelMetadata: requestedMeta,
        evaluatedModels: [requestedModel],
      };
    }

    // Determine allowed candidate models
    let candidatePool: ModelMetadata[];
    if (options.allowedModels && options.allowedModels.length > 0) {
      const allowedSet = new Set(options.allowedModels.map((m) => m.toLowerCase()));
      candidatePool = this.registry.list().filter((m) =>
        allowedSet.has(m.model.toLowerCase())
      );
    } else {
      candidatePool = this.registry.list(effectiveProvider);
    }

    // If requested model exists, ensure required capabilities match or default to requested model's capabilities
    const requiredCaps: ModelCapability[] = [
      ...(options.requirements?.capabilities ?? []),
    ];
    if (request.tools && request.tools.length > 0 && !requiredCaps.includes('tools')) {
      requiredCaps.push('tools');
    }

    // Filter candidates by capabilities & context limits
    const validCandidates = candidatePool.filter((cand) => {
      // Must support context
      if (cand.contextLimits.maxContextTokens < totalTokens) {
        return false;
      }
      if (request.maxTokens && cand.contextLimits.maxOutputTokens < request.maxTokens) {
        return false;
      }
      // Must support required capabilities
      for (const cap of requiredCaps) {
        if (!cand.capabilities.includes(cap)) return false;
      }
      return true;
    });

    // If no candidate satisfies strict filters, fallback to requested model if available
    if (validCandidates.length === 0) {
      return {
        requestedModel,
        actualModel: requestedModel,
        policy,
        reason: `No alternative candidates met requirements (${requiredCaps.join(', ')} / ${totalTokens} tokens); keeping requested model '${requestedModel}'.`,
        estimatedCost: requestedCost,
        estimatedSavings: 0,
        changed: false,
        modelMetadata: requestedMeta,
        evaluatedModels: candidatePool.map((c) => c.model),
      };
    }

    // Evaluate costs for all valid candidates
    const evaluated = validCandidates.map((cand) => {
      const cost = this.estimateCostForModel(cand, inputTokens, outputTokens);
      return {
        cand,
        cost,
        tierRank: TIER_RANK[cand.qualityTier] || 1,
      };
    });

    let selected = evaluated[0];

    switch (policy) {
      case 'cheapest': {
        // Sort lowest cost first; break ties by higher tier rank
        evaluated.sort((a, b) => {
          if (Math.abs(a.cost - b.cost) > 1e-9) {
            return a.cost - b.cost;
          }
          return b.tierRank - a.tierRank;
        });
        selected = evaluated[0];
        break;
      }

      case 'quality-first': {
        // Find highest tier rank available, then cheapest within that tier
        const maxTier = Math.max(...evaluated.map((e) => e.tierRank));
        const highestTierGroup = evaluated.filter((e) => e.tierRank === maxTier);
        highestTierGroup.sort((a, b) => a.cost - b.cost);
        selected = highestTierGroup[0];
        break;
      }

      case 'balanced': {
        // Balanced: prefer standard or fast tier over pure economy to avoid severe quality drops,
        // while picking the most cost-effective option within that quality band.
        const standardOrAbove = evaluated.filter((e) => e.tierRank >= TIER_RANK.fast);
        const poolToSearch = standardOrAbove.length > 0 ? standardOrAbove : evaluated;
        poolToSearch.sort((a, b) => {
          // If difference in cost is large (> 4x), consider cheaper; otherwise prefer higher tier
          if (a.tierRank !== b.tierRank) {
            const costRatio = a.cost > 0 ? b.cost / a.cost : 1;
            if (costRatio > 4) return -1; // b is way more expensive
            if (costRatio < 0.25) return 1; // a is way more expensive
            return b.tierRank - a.tierRank; // prefer higher quality
          }
          return a.cost - b.cost;
        });
        selected = poolToSearch[0];
        break;
      }
    }

    const actualModel = selected.cand.model;
    const actualCost = selected.cost;
    const changed = actualModel.toLowerCase() !== requestedModel.toLowerCase();
    const savings = changed ? Math.max(0, Number((requestedCost - actualCost).toFixed(8))) : 0;

    let reason: string;
    if (changed) {
      if (savings > 0) {
        reason = `Routed from '${requestedModel}' to '${actualModel}' via '${policy}' policy. Estimated savings: $${savings.toFixed(6)} (from $${requestedCost.toFixed(6)} to $${actualCost.toFixed(6)}) while meeting capability criteria [${requiredCaps.join(', ')}].`;
      } else {
        reason = `Routed from '${requestedModel}' to '${actualModel}' via '${policy}' policy for optimal quality and context fit ($${actualCost.toFixed(6)} estimated cost).`;
      }
    } else {
      reason = `Retained requested model '${requestedModel}' (already optimal under '${policy}' policy at $${actualCost.toFixed(6)}).`;
    }

    return {
      requestedModel,
      actualModel,
      policy,
      reason,
      estimatedCost: actualCost,
      estimatedSavings: savings,
      changed,
      modelMetadata: selected.cand,
      evaluatedModels: evaluated.map((e) => e.cand.model),
    };
  }
}
