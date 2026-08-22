import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});

// Same-origin proxy for AI-polished art so the canvas can process it
// (generated-image hosts send no CORS headers). Host allowlist only.
app.get("/api/art-proxy", async (c) => {
  const url = c.req.query("url") ?? "";
  if (!/^https:\/\/(kimi-web-img\.moonshot\.cn|www\.kimi\.com)\//.test(url)) {
    return c.json({ error: "host not allowed" }, 400);
  }
  try {
    const r = await fetch(url);
    if (!r.ok || !r.body) return c.json({ error: "upstream failed" }, 502);
    return new Response(r.body, {
      headers: {
        "Content-Type": r.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return c.json({ error: "upstream failed" }, 502);
  }
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
