import * as fs from 'fs';
import { TokaConfigurationError } from './errors';
import {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_TIMEOUT_MS,
  SDKConfig,
  BudgetPolicy,
  BudgetAction,
  ScopeLimit,
} from './types';

function parseNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new TokaConfigurationError(`${field} must be a finite number.`);
  return parsed;
}

const VALID_ACTIONS: BudgetAction[] = ['allow', 'warn', 'fallback', 'block'];

function validateScopeLimit(value: unknown, field: string): ScopeLimit {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new TokaConfigurationError(
        `${field} must be a finite non-negative number.`
      );
    }
    return value;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as {
      limit?: unknown;
      action?: unknown;
      warnThreshold?: unknown;
    };
    if (
      typeof obj.limit !== 'number' ||
      !Number.isFinite(obj.limit) ||
      obj.limit < 0
    ) {
      throw new TokaConfigurationError(
        `${field}.limit must be a finite non-negative number.`
      );
    }
    if (
      obj.action !== undefined &&
      (!VALID_ACTIONS.includes(obj.action as BudgetAction) ||
        typeof obj.action !== 'string')
    ) {
      throw new TokaConfigurationError(
        `${field}.action must be one of: ${VALID_ACTIONS.join(', ')}.`
      );
    }
    if (
      obj.warnThreshold !== undefined &&
      (typeof obj.warnThreshold !== 'number' ||
        !Number.isFinite(obj.warnThreshold) ||
        obj.warnThreshold < 0)
    ) {
      throw new TokaConfigurationError(
        `${field}.warnThreshold must be a finite non-negative number.`
      );
    }
    return {
      limit: obj.limit,
      action: obj.action as BudgetAction | undefined,
      warnThreshold: obj.warnThreshold,
    };
  }
  throw new TokaConfigurationError(
    `${field} must be a number or limit configuration object.`
  );
}

export function validateBudgetPolicy(policy: unknown): BudgetPolicy {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new TokaConfigurationError('budgets must be an object.');
  }
  const input = policy as Partial<BudgetPolicy>;
  const validated: BudgetPolicy = {};

  if (input.perRequest !== undefined) {
    validated.perRequest = validateScopeLimit(
      input.perRequest,
      'budgets.perRequest'
    );
  }
  if (input.perTask !== undefined) {
    validated.perTask = validateScopeLimit(input.perTask, 'budgets.perTask');
  }
  if (input.perSession !== undefined) {
    validated.perSession = validateScopeLimit(
      input.perSession,
      'budgets.perSession'
    );
  }
  if (input.perDay !== undefined) {
    validated.perDay = validateScopeLimit(input.perDay, 'budgets.perDay');
  }
  if (input.perMonth !== undefined) {
    validated.perMonth = validateScopeLimit(
      input.perMonth,
      'budgets.perMonth'
    );
  }

  if (input.action !== undefined) {
    if (
      typeof input.action !== 'string' ||
      !VALID_ACTIONS.includes(input.action as BudgetAction)
    ) {
      throw new TokaConfigurationError(
        `budgets.action must be one of: ${VALID_ACTIONS.join(', ')}.`
      );
    }
    validated.action = input.action as BudgetAction;
  }
  if (input.defaultAction !== undefined) {
    if (
      typeof input.defaultAction !== 'string' ||
      !VALID_ACTIONS.includes(input.defaultAction as BudgetAction)
    ) {
      throw new TokaConfigurationError(
        `budgets.defaultAction must be one of: ${VALID_ACTIONS.join(', ')}.`
      );
    }
    validated.defaultAction = input.defaultAction as BudgetAction;
  }

  if (input.approvalRequiredAbove !== undefined) {
    if (
      typeof input.approvalRequiredAbove !== 'number' ||
      !Number.isFinite(input.approvalRequiredAbove) ||
      input.approvalRequiredAbove < 0
    ) {
      throw new TokaConfigurationError(
        'budgets.approvalRequiredAbove must be a finite non-negative number.'
      );
    }
    validated.approvalRequiredAbove = input.approvalRequiredAbove;
  }

  if (input.timezone !== undefined) {
    if (typeof input.timezone !== 'string' || !input.timezone.trim()) {
      throw new TokaConfigurationError(
        'budgets.timezone must be a non-empty string.'
      );
    }
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: input.timezone });
    } catch {
      throw new TokaConfigurationError(
        `Invalid IANA timezone in budget configuration: '${input.timezone}'.`
      );
    }
    validated.timezone = input.timezone;
  }

  return validated;
}

export function validateConfig(input: Partial<SDKConfig>): SDKConfig {
  if (input.apiKey !== undefined && typeof input.apiKey !== 'string')
    throw new TokaConfigurationError('apiKey must be a string when provided.');
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

  return {
    apiKey: input.apiKey,
    models: [...input.models],
    maxCostPerRequest: maxCostPerRequest ?? 1,
    budgets: validatedBudgets,
    cacheTTL,
    timeoutMs,
    retry,
    pricing: input.pricing ? { ...input.pricing } : undefined,
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
