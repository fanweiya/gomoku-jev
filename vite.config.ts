import { defineConfig, loadEnv } from 'vite';
import type { Plugin, Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Buffer } from 'node:buffer';
import { FORBIDDEN_HEADERS, isAllowedUpstream } from './functions/api/upstream-allowlist';

function jevProxyPlugin(mode: string): Plugin {
  const handler: Connect.NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const pathname = req.url ? req.url.split('?')[0] : '';
    if (req.method === 'POST' && pathname === '/api/jev') {
      // 本地代理只接受本机访问：校验 Host 与 Origin，防止任意网页借浏览器向代理发起请求。
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?$/.test(host)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'forbidden host' }));
        return;
      }
      const origin = req.headers.origin;
      if (origin) {
        try {
          if (new URL(origin).host !== host) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'forbidden origin' }));
            return;
          }
        } catch {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'forbidden origin' }));
          return;
        }
      }
      const env = loadEnv(mode, process.cwd(), '');
      const clientEndpoint = req.headers['x-jev-endpoint'] as string | undefined;
      const clientApiKey = req.headers['x-jev-api-key'] as string | undefined;
      const clientCustomHeadersRaw = req.headers['x-jev-custom-headers'] as string | undefined;

      let targetUrl = 'https://api.typesafe.ai/v1/systemone';
      if (clientEndpoint) {
        if (!isAllowedUpstream(clientEndpoint)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'endpoint not allowed' }));
          return;
        }
        targetUrl = clientEndpoint;
      }

      // 服务端密钥只允许用于 Cloudflare Clef 通道（api.cloudflare.com），
      // 其余上游必须由客户端自带密钥，避免本地环境变量被转发到任意白名单地址。
      let apiKey = clientApiKey || '';
      if (!apiKey) {
        try {
          if (new URL(targetUrl).hostname === 'api.cloudflare.com') {
            apiKey = env.CF_CLEF_API_KEY || process.env.CF_CLEF_API_KEY || '';
          }
        } catch {
          // targetUrl 已通过 isAllowedUpstream 校验，不会走到这里
        }
      }

      if (!apiKey) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'missing API key, fallback to local heuristic' }));
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let tooLarge = false;
      req.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > 256 * 1024) {
          tooLarge = true;
          chunks.length = 0;
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', async () => {
        if (tooLarge) {
          res.statusCode = 413;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'request body too large' }));
          return;
        }
        try {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          };

          if (clientCustomHeadersRaw) {
            try {
              const parsed = JSON.parse(clientCustomHeadersRaw);
              for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === 'string' && !FORBIDDEN_HEADERS.has(k.toLowerCase())) {
                  headers[k] = v;
                }
              }
            } catch {
              // Ignore invalid json
            }
          }

          if (targetUrl.includes('codiv.ai') && !headers['User-Agent']) {
            headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
          }

          const upstreamResponse = await fetch(targetUrl, {
            method: 'POST',
            headers,
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
