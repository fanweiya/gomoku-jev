interface Env {
  JEV_API_KEY?: string;
  TYPESAFE_API_KEY?: string;
  SUBQ_API_KEY?: string;
  CODIV_API_KEY?: string;
  CF_API_TOKEN?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const reqHeaders = context.request.headers;
  const clientEndpoint = reqHeaders.get('x-jev-endpoint');
  const clientApiKey = reqHeaders.get('x-jev-api-key');
  const clientCustomHeadersRaw = reqHeaders.get('x-jev-custom-headers');

  const targetUrl = clientEndpoint || 'https://api.typesafe.ai/v1/systemone';
  const apiKey = clientApiKey ||
    context.env.JEV_API_KEY ||
    context.env.TYPESAFE_API_KEY ||
    context.env.SUBQ_API_KEY ||
    context.env.CODIV_API_KEY ||
    context.env.CF_API_TOKEN ||
    '';

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'missing API key, fallback to local heuristic' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const rawBody = await context.request.text();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    if (clientCustomHeadersRaw) {
      try {
        const parsed = JSON.parse(clientCustomHeadersRaw);
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string') {
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
    return new Response(JSON.stringify({ error: 'upstream error or timeout' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
