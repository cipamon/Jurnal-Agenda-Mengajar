import serverless from 'serverless-http';

type ServerlessHandler = ReturnType<typeof serverless>;

let cachedHandlerPromise: Promise<ServerlessHandler> | null = null;

async function getHandler(): Promise<ServerlessHandler> {
  if (!cachedHandlerPromise) {
    if (!process.env.PORTAL_NETLIFY_FUNCTION) {
      process.env.PORTAL_NETLIFY_FUNCTION = '1';
    }
    cachedHandlerPromise = import('../../server.ts').then(async ({ createApiApp }) => {
      const app = await createApiApp();
      return serverless(app, {
        request(req: { url?: string }) {
          if (typeof req.url === 'string' && req.url.startsWith('/.netlify/functions/api')) {
            const stripped = req.url.slice('/.netlify/functions/api'.length) || '/';
            req.url = stripped.startsWith('/api')
              ? stripped
              : `/api${stripped.startsWith('/') ? stripped : `/${stripped}`}`;
          }
        },
      });
    });
  }
  return cachedHandlerPromise;
}

export const handler = async (
  event: Record<string, unknown>,
  context: Record<string, unknown>
) => {
  const fn = await getHandler();
  const rawPath = typeof event?.path === 'string' ? event.path : '';
  const normalizedPath = rawPath.startsWith('/.netlify/functions/api')
    ? (() => {
        const stripped = rawPath.slice('/.netlify/functions/api'.length) || '/';
        return stripped.startsWith('/api')
          ? stripped
          : `/api${stripped.startsWith('/') ? stripped : `/${stripped}`}`;
      })()
    : rawPath;

  return fn({ ...event, path: normalizedPath }, context);
};
