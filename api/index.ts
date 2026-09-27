import type { IncomingMessage, ServerResponse } from 'http';
import { handleRequest } from '../src/server';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  return handleRequest(req, res);
}
