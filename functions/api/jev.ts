import { FORBIDDEN_HEADERS, allowsServerKey, isAllowedUpstream } from './upstream-allowlist';

interface Env {
  CF_CLEF_API_KEY?: string;
}

const MAX_BODY_BYTES = 256 * 1024;
// 每客户端 IP 每分钟的请求上限；Pages Function 实例内存中的简单计数，
// 作为滥用兜底，配合上游白名单与密钥要求使用。
const RATE_LIMIT_PER_MINUTE = 60;
const MAX_RATE_BUCKETS = 5000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

// 清理过期窗口，并把突发 IP 数封顶，避免 Map 只增不减无限增长。
// 注意：每 isolate 各自记一份，IP 轮换/多 isolate 仍可稀释限流，
// 此处只是实例内兜底；强限流须走 Cloudflare 侧 Rate Limiting。
function pruneRateBuckets(now: number): void {
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) {
      rateBuckets.delete(ip);
    }
  }
  while (rateBuckets.size > MAX_RATE_BUCKETS) {
    const oldest = rateBuckets.keys().next();
    if (oldest.done) {
      break;
    }
    rateBuckets.delete(oldest.value);
  }
}

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
  // 注意：不带 Origin 的请求（如 curl）不受此项约束，防滥用真正
  // 依赖下面的密钥白名单与速率限制，本项只是浏览器侧的附加屏障。
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
  pruneRateBuckets(now);
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

  // 服务端密钥仅允许用于 allowsServerKey 判定的那条完整 Clef
  // endpoint，其余上游必须由客户端自带密钥，避免服务端凭据被转发
  // 到任意白名单地址。
  let apiKey = clientApiKey || '';
  if (!apiKey && allowsServerKey(targetUrl)) {
    apiKey = context.env.CF_CLEF_API_KEY || '';
  }
  if (!apiKey) {
    return json(401, { error: 'missing API key, fallback to local heuristic' });
  }

  const contentLength = Number(reqHeaders.get('content-length') || '0');
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { error: 'request body too large' });
  }

  // 请求体上限按字节计：rawBody.length 是 UTF-16 码元数，3 字节字符
  // 为主的 body 会在约 768 KiB 才触发上限，故先按字节取再解码。
  const rawBuffer = await context.request.arrayBuffer();
  if (rawBuffer.byteLength > MAX_BODY_BYTES) {
    return json(413, { error: 'request body too large' });
  }
  const rawBody = new TextDecoder().decode(rawBuffer);

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
