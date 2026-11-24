import type { IncomingMessage, ServerResponse } from 'http';
import { createApiApp } from '../server.ts';

let cachedAppPromise: ReturnType<typeof createApiApp> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!cachedAppPromise) {
    cachedAppPromise = createApiApp();
  }
  const app = await cachedAppPromise;
  return app(
    req as Parameters<typeof app>[0],
    res as Parameters<typeof app>[1]
  );
}
