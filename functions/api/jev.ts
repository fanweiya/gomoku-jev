import { FORBIDDEN_HEADERS, isAllowedUpstream } from './upstream-allowlist';

interface Env {
  CF_CLEF_API_KEY?: string;
}

const MAX_BODY_BYTES = 256 * 1024;
// 每客户端 IP 每分钟的请求上限；Pages Function 实例内存中的简单计数，
// 作为滥用兜底，配合上游白名单与密钥要求使用。
const RATE_LIMIT_PER_MINUTE = 60;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const reqHeaders = context.request.headers;

  // 来源校验：浏览器跨站请求会带 Origin，要求其与本站 host 一致，
  // 阻止任意网页借用户浏览器调用本代理消耗上游额度。
  const origin = reqHeaders.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(context.request.url).host) {
        return json(403, { error: 'forbidden origin' });
      }
    } catch {
      return json(403, { error: 'forbidden origin' });
    }
  }

  // 简单速率限制：按 cf-connecting-ip 计数，窗口 60 秒。
  const ip = reqHeaders.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (bucket && bucket.resetAt > now) {
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_PER_MINUTE) {
      return json(429, { error: 'rate limit exceeded' });
    }
  } else {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
  }

  const clientEndpoint = reqHeaders.get('x-jev-endpoint');
  const clientApiKey = reqHeaders.get('x-jev-api-key');
  const clientCustomHeadersRaw = reqHeaders.get('x-jev-custom-headers');

  let targetUrl = 'https://api.typesafe.ai/v1/systemone';
  if (clientEndpoint) {
    if (!isAllowedUpstream(clientEndpoint)) {
      return json(400, { error: 'endpoint not allowed' });
    }
    targetUrl = clientEndpoint;
  }

  // 服务端密钥只允许用于 Cloudflare Clef 通道（api.cloudflare.com），
  // 其余上游必须由客户端自带密钥，避免服务端凭据被转发到任意白名单地址。
  let apiKey = clientApiKey || '';
  if (!apiKey) {
    try {
      if (new URL(targetUrl).hostname === 'api.cloudflare.com') {
        apiKey = context.env.CF_CLEF_API_KEY || '';
      }
    } catch {
      // targetUrl 已通过 isAllowedUpstream 校验，不会走到这里
    }
  }
  if (!apiKey) {
    return json(401, { error: 'missing API key, fallback to local heuristic' });
  }

  const contentLength = Number(reqHeaders.get('content-length') || '0');
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { error: 'request body too large' });
  }

  const rawBody = await context.request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return json(413, { error: 'request body too large' });
  }

  try {
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

    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(10000),
    });

    const responseText = await upstream.text();
    return new Response(responseText, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return json(502, { error: 'upstream error or timeout' });
  }
};
