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

export function createCacheKey(
  request: SDKRequest,
  namespace = 'toka:v1'
): string {
  const canonical = JSON.stringify(canonicalize(request));
  const digest = createHash('sha256').update(canonical).digest('hex');
  return `${namespace}:${digest}`;
}

export { canonicalize };
