const ALLOWED_MODELS = new Set([
  "taka-flash-8b",
  "taka-max-120b",
  "taka-ultra-70b",
  "taka-qwen-27b",
  "taka-pro-20b"
]);

export async function POST(request) {
  const apiKey = process.env.TAKA_API_KEY;
  const gatewayUrl = process.env.TAKA_GATEWAY_URL || "https://taka-ai-gateway.vercel.app/v1/chat/completions";

  if (!apiKey) {
    return Response.json(
      { error: "Server API key missing. Add TAKA_API_KEY in Vercel Environment Variables." },
      { status: 500 }
    );
  }

  // Block cross-site hotlinking from other domains
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return Response.json({ error: "Forbidden origin" }, { status: 403 });
      }
    } catch {
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = Array.isArray(body?.messages) ? body.messages.slice(-60) : null;
  if (!messages || !messages.length) {
    return Response.json({ error: "Messages array is required" }, { status: 400 });
  }

  const model = ALLOWED_MODELS.has(body?.model) ? body.model : "taka-flash-8b";
  const stream = body?.stream !== false;

  try {
    const upstream = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, messages, stream })
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return Response.json(
        { error: `Upstream gateway error (${upstream.status})`, detail: errText.slice(0, 300) },
        { status: upstream.status }
      );
    }

    if (stream && upstream.body) {
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    const data = await upstream.json();
    return Response.json(data, { status: 200 });
  } catch (err) {
    return Response.json(
      { error: "Failed to reach AI gateway", detail: String(err?.message || err) },
      { status: 502 }
    );
  }
}

export async function GET() {
  return Response.json({ error: "Method Not Allowed. Use POST." }, { status: 405 });
}
