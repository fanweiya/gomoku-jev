interface Env {
  JEV_API_KEY?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.JEV_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'missing JEV_API_KEY' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const rawBody = await context.request.text();
    const upstream = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
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
