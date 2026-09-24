import * as fs from 'fs';
import { BudgetAction, BudgetPolicy, ScopeLimit } from './budgets/types';
import { TokaConfigurationError } from './errors';
import { RoutingPolicy, RoutingConfig } from './routing/types';
import {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_TIMEOUT_MS,
  SDKConfig,
} from './types';

function parseNumber(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new TokaConfigurationError(
      `Environment variable ${name} must be a valid number, got '${value}'.`
    );
  return parsed;
}

export function validateScopeLimit(limit: unknown, scopeName: string): ScopeLimit {
  if (typeof limit === 'number') {
    if (!Number.isFinite(limit) || limit < 0) {
      throw new TokaConfigurationError(
        `Budget limit for ${scopeName} must be a non-negative finite number.`
      );
    }
    return limit;
  }

  if (limit && typeof limit === 'object') {
    const config = limit as Record<string, unknown>;
    if (typeof config.limit !== 'number' || !Number.isFinite(config.limit) || config.limit < 0) {
      throw new TokaConfigurationError(
        `Budget limit for ${scopeName} must specify a non-negative numeric 'limit'.`
      );
    }

    const action = config.action as string | undefined;
    if (action !== undefined && !['allow', 'warn', 'fallback', 'block'].includes(action)) {
      throw new TokaConfigurationError(
        `Invalid action '${action}' for ${scopeName}. Allowed actions: allow, warn, fallback, block.`
      );
    }

    if (config.warnThreshold !== undefined) {
      if (
        typeof config.warnThreshold !== 'number' ||
        !Number.isFinite(config.warnThreshold) ||
        config.warnThreshold < 0 ||
        config.warnThreshold > 1
      ) {
        throw new TokaConfigurationError(
          `warnThreshold for ${scopeName} must be a number between 0 and 1.`
        );
      }
    }

    return {
      limit: config.limit,
      action: action as BudgetAction | undefined,
      warnThreshold: config.warnThreshold as number | undefined,
    };
  }

  throw new TokaConfigurationError(
    `Invalid budget limit configuration for ${scopeName}. Expected number or limit config object.`
  );
}

export function validateBudgetPolicy(policy: unknown): BudgetPolicy {
  if (!policy || typeof policy !== 'object') {
    throw new TokaConfigurationError('Budget policy must be a non-null object.');
  }

  const p = policy as Record<string, unknown>;
  const validated: BudgetPolicy = {};

  if (p.perRequest !== undefined) {
    validated.perRequest = validateScopeLimit(p.perRequest, 'perRequest');
  }
  if (p.perTask !== undefined) {
    validated.perTask = validateScopeLimit(p.perTask, 'perTask');
  }
  if (p.perSession !== undefined) {
    validated.perSession = validateScopeLimit(p.perSession, 'perSession');
  }
  if (p.perDay !== undefined) {
    validated.perDay = validateScopeLimit(p.perDay, 'perDay');
  }
  if (p.perMonth !== undefined) {
    validated.perMonth = validateScopeLimit(p.perMonth, 'perMonth');
  }

  const defaultAction = (p.defaultAction ?? p.action) as string | undefined;
  if (defaultAction !== undefined) {
    if (!['allow', 'warn', 'fallback', 'block'].includes(defaultAction)) {
      throw new TokaConfigurationError(
        `Invalid defaultAction '${defaultAction}'. Allowed actions: allow, warn, fallback, block.`
      );
    }
    validated.defaultAction = defaultAction as BudgetAction;
    validated.action = defaultAction as BudgetAction;
  }

  if (p.approvalRequiredAbove !== undefined) {
    if (
      typeof p.approvalRequiredAbove !== 'number' ||
      !Number.isFinite(p.approvalRequiredAbove) ||
      p.approvalRequiredAbove < 0
    ) {
      throw new TokaConfigurationError(
        'approvalRequiredAbove must be a non-negative finite number.'
      );
    }
    validated.approvalRequiredAbove = p.approvalRequiredAbove;
  }

  if (p.timezone !== undefined) {
    if (typeof p.timezone !== 'string' || p.timezone.trim() === '') {
      throw new TokaConfigurationError('timezone must be a non-empty string.');
    }
    validated.timezone = p.timezone;
  }

  return validated;
}

const ALLOWED_ROUTING_POLICIES: RoutingPolicy[] = [
  'cheapest',
  'balanced',
  'quality-first',
  'strict-model',
];

export function validateConfig(input: Partial<SDKConfig>): SDKConfig {
  if (!Array.isArray(input.models) || input.models.length === 0)
    throw new TokaConfigurationError('models must be a non-empty array.');
  if (
    input.models.some(
      (model) => typeof model !== 'string' || model.trim() === ''
    )
  )
    throw new TokaConfigurationError(
      'models must contain only non-empty strings.'
    );

  if (input.maxCostPerRequest !== undefined) {
    if (
      typeof input.maxCostPerRequest !== 'number' ||
      !Number.isFinite(input.maxCostPerRequest) ||
      input.maxCostPerRequest <= 0
    ) {
      throw new TokaConfigurationError(
        'maxCostPerRequest must be a finite number greater than 0.'
      );
    }
  }

  if (input.budgets === undefined && input.maxCostPerRequest === undefined) {
    throw new TokaConfigurationError(
      'Either budgets or maxCostPerRequest must be configured.'
    );
  }

  let validatedBudgets: BudgetPolicy | undefined;
  if (input.budgets !== undefined) {
    validatedBudgets = validateBudgetPolicy(input.budgets);
  }

  // Backward compatibility synchronization
  let maxCostPerRequest = input.maxCostPerRequest;
  if (validatedBudgets) {
    if (
      maxCostPerRequest === undefined &&
      validatedBudgets.perRequest !== undefined
    ) {
      maxCostPerRequest =
        typeof validatedBudgets.perRequest === 'number'
          ? validatedBudgets.perRequest
          : validatedBudgets.perRequest.limit;
    }
    if (
      validatedBudgets.perRequest === undefined &&
      maxCostPerRequest !== undefined
    ) {
      validatedBudgets.perRequest = maxCostPerRequest;
    }
  } else if (maxCostPerRequest !== undefined) {
    validatedBudgets = {
      perRequest: maxCostPerRequest,
      defaultAction: 'block',
    };
  }

  const cacheTTL = input.cacheTTL ?? DEFAULT_CACHE_TTL_MS;
  if (!Number.isFinite(cacheTTL) || cacheTTL < 0)
    throw new TokaConfigurationError(
      'cacheTTL must be a finite, non-negative number of milliseconds.'
    );

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new TokaConfigurationError(
      'timeoutMs must be a finite number greater than 0.'
    );

  const retry = {
    maxRetries: input.retry?.maxRetries ?? 2,
    exponentialBackoff: input.retry?.exponentialBackoff ?? true,
    baseDelayMs: input.retry?.baseDelayMs ?? 250,
  };
  if (!Number.isInteger(retry.maxRetries) || retry.maxRetries < 0)
    throw new TokaConfigurationError(
      'retry.maxRetries must be a non-negative integer.'
    );
  if (!Number.isFinite(retry.baseDelayMs) || retry.baseDelayMs < 0)
    throw new TokaConfigurationError(
      'retry.baseDelayMs must be a non-negative finite number.'
    );
  if (typeof retry.exponentialBackoff !== 'boolean')
    throw new TokaConfigurationError(
      'retry.exponentialBackoff must be boolean.'
    );

  if (input.pricing)
    for (const [key, pricing] of Object.entries(input.pricing)) {
      if (
        !key.includes(':') ||
        !Number.isFinite(pricing.inputPricePerMillionTokens) ||
        pricing.inputPricePerMillionTokens < 0 ||
        !Number.isFinite(pricing.outputPricePerMillionTokens) ||
        pricing.outputPricePerMillionTokens < 0
      )
        throw new TokaConfigurationError(`Invalid pricing override '${key}'.`);
    }

  const routing: RoutingConfig | RoutingPolicy | undefined = input.routing;
  if (typeof routing === 'string') {
    if (!ALLOWED_ROUTING_POLICIES.includes(routing)) {
      throw new TokaConfigurationError(
        `Invalid routing policy '${routing}'. Allowed policies: ${ALLOWED_ROUTING_POLICIES.join(', ')}`
      );
    }
  } else if (routing && typeof routing === 'object') {
    if (routing.policy && !ALLOWED_ROUTING_POLICIES.includes(routing.policy)) {
      throw new TokaConfigurationError(
        `Invalid routing policy '${routing.policy}'. Allowed policies: ${ALLOWED_ROUTING_POLICIES.join(', ')}`
      );
    }
  }

  return {
    apiKey: input.apiKey,
    models: [...input.models],
    maxCostPerRequest: maxCostPerRequest ?? 1,
    budgets: validatedBudgets,
    cacheTTL,
    timeoutMs,
    retry,
    pricing: input.pricing ? { ...input.pricing } : undefined,
    routing,
    modelsMetadata: input.modelsMetadata,
    caching: input.caching,
  };
}

export function loadConfig(configPath?: string): SDKConfig {
  let fileConfig: Partial<SDKConfig> = {};
  if (configPath) {
    try {
      fileConfig = JSON.parse(
        fs.readFileSync(configPath, 'utf8')
      ) as Partial<SDKConfig>;
    } catch (cause) {
      throw new TokaConfigurationError(
        `Failed to parse configuration file: ${configPath}`,
        { cause }
      );
    }
  }

  const envConfig: Partial<SDKConfig> = {};
  if (process.env.TOKA_API_KEY !== undefined)
    envConfig.apiKey = process.env.TOKA_API_KEY;
  if (
    process.env.OPENAI_API_KEY !== undefined &&
    envConfig.apiKey === undefined
  )
    envConfig.apiKey = process.env.OPENAI_API_KEY;
  if (process.env.TOKA_MODELS !== undefined)
    envConfig.models = process.env.TOKA_MODELS.split(',').map((model) =>
      model.trim()
    );
  if (process.env.TOKA_MAX_COST !== undefined)
    envConfig.maxCostPerRequest = parseNumber(
      process.env.TOKA_MAX_COST,
      'TOKA_MAX_COST'
    );
  if (process.env.TOKA_CACHE_TTL !== undefined)
    envConfig.cacheTTL = parseNumber(
      process.env.TOKA_CACHE_TTL,
      'TOKA_CACHE_TTL'
    );
  if (process.env.TOKA_TIMEOUT_MS !== undefined)
    envConfig.timeoutMs = parseNumber(
      process.env.TOKA_TIMEOUT_MS,
      'TOKA_TIMEOUT_MS'
    );

  if (process.env.TOKA_ROUTING_POLICY !== undefined) {
    envConfig.routing = process.env.TOKA_ROUTING_POLICY as RoutingPolicy;
  }

  // Budget environment variables
  const envBudgets: Partial<BudgetPolicy> = {};
  if (process.env.TOKA_BUDGET_PER_REQUEST !== undefined) {
    envBudgets.perRequest = parseNumber(
      process.env.TOKA_BUDGET_PER_REQUEST,
      'TOKA_BUDGET_PER_REQUEST'
    );
  }
  if (process.env.TOKA_BUDGET_PER_TASK !== undefined) {
    envBudgets.perTask = parseNumber(
      process.env.TOKA_BUDGET_PER_TASK,
      'TOKA_BUDGET_PER_TASK'
    );
  }
  if (process.env.TOKA_BUDGET_PER_SESSION !== undefined) {
    envBudgets.perSession = parseNumber(
      process.env.TOKA_BUDGET_PER_SESSION,
      'TOKA_BUDGET_PER_SESSION'
    );
  }
  if (process.env.TOKA_BUDGET_PER_DAY !== undefined) {
    envBudgets.perDay = parseNumber(
      process.env.TOKA_BUDGET_PER_DAY,
      'TOKA_BUDGET_PER_DAY'
    );
  }
  if (process.env.TOKA_BUDGET_PER_MONTH !== undefined) {
    envBudgets.perMonth = parseNumber(
      process.env.TOKA_BUDGET_PER_MONTH,
      'TOKA_BUDGET_PER_MONTH'
    );
  }
  if (process.env.TOKA_BUDGET_ACTION !== undefined) {
    envBudgets.action = process.env.TOKA_BUDGET_ACTION as BudgetAction;
  }
  if (process.env.TOKA_APPROVAL_THRESHOLD !== undefined) {
    envBudgets.approvalRequiredAbove = parseNumber(
      process.env.TOKA_APPROVAL_THRESHOLD,
      'TOKA_APPROVAL_THRESHOLD'
    );
  }
  if (process.env.TOKA_TIMEZONE !== undefined) {
    envBudgets.timezone = process.env.TOKA_TIMEZONE;
  }

  if (Object.keys(envBudgets).length > 0) {
    envConfig.budgets = {
      ...(fileConfig.budgets ?? {}),
      ...envBudgets,
    };
  }

  return validateConfig({ ...fileConfig, ...envConfig });
}

export function createSampleConfig(): SDKConfig {
  return validateConfig({
    apiKey: 'sample-api-key',
    models: ['gpt-4', 'gpt-3.5-turbo'],
    maxCostPerRequest: 1,
  });
}
