export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return new Response("Roniya Telegram Bridge OK", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const expectedSecret = String(env.PROXY_SECRET || "");
    const providedSecret = String(request.headers.get("X-Roniya-Proxy-Key") || "");

    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Permit only Telegram methods currently used by Roniya.
    // Never log the request URL because it contains the bot token.
    const match = url.pathname.match(
      /^\/(bot[0-9]+:[A-Za-z0-9_-]+)\/(sendMessage|sendPhoto)$/
    );

    if (!match) {
      return new Response("Not Found", { status: 404 });
    }

    try {
      const upstreamUrl = `https://api.telegram.org${url.pathname}${url.search}`;
      const headers = new Headers();
      const contentType = request.headers.get("Content-Type");
      if (contentType) headers.set("Content-Type", contentType);

      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers,
        // Preserve JSON and multipart bodies byte-for-byte.
        body: await request.arrayBuffer(),
        redirect: "manual",
      });

      const responseHeaders = new Headers({
        "Cache-Control": "no-store",
      });
      const upstreamContentType = upstream.headers.get("Content-Type");
      if (upstreamContentType) {
        responseHeaders.set("Content-Type", upstreamContentType);
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch {
      // Do not expose upstream exceptions or token-bearing URLs.
      return new Response("Telegram upstream unavailable", {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
  },
};
