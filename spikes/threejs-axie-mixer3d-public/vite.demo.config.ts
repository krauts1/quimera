import { defineConfig, loadEnv, type Plugin } from 'vite';
import { resolve } from 'node:path';
import {
  AXIE_LOOKUP_CACHE_SECONDS,
  isValidAxieId,
  loadAxieLookup,
} from './server/axie-lookup';

function axieLookupDevApi(apiKey: string | undefined): Plugin {
  return {
    name: 'axie-id-dev-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        const match = /^\/api\/axies\/([^/]+)$/u.exec(url.pathname);
        if (!match) return next();
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        if (request.method !== 'GET') {
          response.statusCode = 405;
          response.setHeader('Allow', 'GET');
          response.end(JSON.stringify({ error: 'Method not allowed.' }));
          return;
        }
        const id = decodeURIComponent(match[1]).trim();
        if (!isValidAxieId(id)) {
          response.statusCode = 400;
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify({
            error: 'Axie ID must be a positive decimal number using at most 12 digits.',
          }));
          return;
        }
        try {
          const payload = await loadAxieLookup(id, {
            apiKey,
          });
          response.statusCode = 200;
          response.setHeader(
            'Cache-Control',
            `public, max-age=0, s-maxage=${AXIE_LOOKUP_CACHE_SECONDS}, stale-while-revalidate=86400`,
          );
          response.end(JSON.stringify(payload));
        } catch (error) {
          server.config.logger.error(
            `[axie-id-dev-api] ${error instanceof Error ? error.message : String(error)}`,
          );
          response.statusCode = 502;
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify({ error: `Axie #${id} could not be resolved. Try again shortly.` }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Vite intentionally loads .env files after evaluating user config unless
  // loadEnv is called here. Loading the repository-root file explicitly keeps
  // SKY_MAVIS_API_KEY in this Node-only middleware and out of browser imports.
  const serverEnvironment = loadEnv(mode, import.meta.dirname, '');
  const apiKey = process.env.SKY_MAVIS_API_KEY ?? serverEnvironment.SKY_MAVIS_API_KEY;
  return {
    plugins: [axieLookupDevApi(apiKey)],
    root: resolve(import.meta.dirname, 'demo'),
    envDir: import.meta.dirname,
    publicDir: resolve(import.meta.dirname, 'public'),
    build: {
      outDir: resolve(import.meta.dirname, 'demo-dist'),
      emptyOutDir: true,
      copyPublicDir: false,
      sourcemap: true,
    },
    server: {
      fs: {
        allow: [import.meta.dirname],
      },
      watch: {
        ignored: ['**/public/assets/axie/**'],
      },
    },
  };
});
