import { defineConfig, loadEnv } from 'vite';
import type { Plugin, Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Buffer } from 'node:buffer';

function jevProxyPlugin(mode: string): Plugin {
  const handler: Connect.NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const pathname = req.url ? req.url.split('?')[0] : '';
    if (req.method === 'POST' && pathname === '/api/jev') {
      const env = loadEnv(mode, process.cwd(), '');
      const apiKey = env.JEV_API_KEY || process.env.JEV_API_KEY;

      if (!apiKey) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'missing JEV_API_KEY' }));
        return;
      }

      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      req.on('end', async () => {
        try {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          const upstreamResponse = await fetch('https://api.typesafe.ai/v1/systemone', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: rawBody,
            signal: AbortSignal.timeout(10000),
          });

          const responseText = await upstreamResponse.text();
          res.statusCode = upstreamResponse.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(responseText);
        } catch {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'upstream error or timeout' }));
        }
      });

      req.on('error', () => {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'upstream error or timeout' }));
      });
      return;
    }
    next();
  };

  return {
    name: 'jev-proxy-plugin',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [jevProxyPlugin(mode)],
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
}));
