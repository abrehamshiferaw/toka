import { createHash } from 'crypto';
import { SDKRequest } from '../types';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const item = (value as Record<string, unknown>)[key];
        if (item !== undefined) result[key] = canonicalize(item);
        return result;
      }, {});
  }
  return value;
}

export interface CacheKeyOptions {
  namespace?: string;
  includeCommitSha?: boolean;
}

export function createCacheKey(
  request: SDKRequest,
  namespace = 'toka:v1',
  options: CacheKeyOptions = {}
): string {
  // Normalize canonical request
  const canonical = JSON.stringify(canonicalize(request));
  const digest = createHash('sha256').update(canonical).digest('hex');

  const repo = request.agentContext?.repository;
  const commit = options.includeCommitSha !== false ? request.agentContext?.commitSha : undefined;

  let prefix = namespace;
  if (repo) {
    prefix = `${prefix}:${repo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }
  if (commit) {
    prefix = `${prefix}:${commit.substring(0, 12)}`;
  }

  return `${prefix}:${digest}`;
}

export { canonicalize };
