import { SDKRequest, getMessageText } from '../types';

const SENSITIVE_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bghp_[a-zA-Z0-9]{20,}\b/,
  /\bgho_[a-zA-Z0-9]{20,}\b/,
  /\bsk-(?:proj-|live-)?[a-zA-Z0-9_-]{20,}\b/,
  /\bAIza[0-9A-Za-z-_]{35}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[0-9a-zA-Z-]{10,}\b/,
  /\bBearer\s+[a-zA-Z0-9_\-\.]{25,}\b/i,
  /\b(?:password|secret|passwd|token)\s*[:=]\s*['"][^'"]{6,}['"]/i,
];

export function containsSensitiveData(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isSensitiveRequest(request: SDKRequest): boolean {
  // Check explicit sensitivity flags
  if ((request as { sensitive?: boolean }).sensitive === true) {
    return true;
  }
  if (request.metadata?.sensitive === true) {
    return true;
  }
  if (request.agentContext?.metadata?.sensitive === true) {
    return true;
  }

  // Scan text content of all messages
  const fullText = getMessageText(request.messages);
  return containsSensitiveData(fullText);
}
