// ─── Vercel serverless entry: tRPC ──────────────────────────────────────────
// The app normally runs as a long-lived Hono server (api/boot.ts). On Vercel
// each request is a short-lived function, so this entry adapts Node's
// req/res to the web Request/Response that tRPC's fetch adapter expects.
//
// It deliberately does NOT import api/boot.ts: that module pulls in api/lib/env
// which throws in production when APP_ID / APP_SECRET / DATABASE_URL are unset,
// and none of those are used by anything the app actually does.

import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../router";
import { createContext } from "../context";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `https://${host}`);

    // tRPC needs the body as a stream-free value; collect it for non-GET verbs
    let body: Buffer | undefined;
    if (req.method && !["GET", "HEAD"].includes(req.method)) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      body = chunks.length ? Buffer.concat(chunks) : undefined;
    }

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }

    // `body` is a Buffer; Request accepts it at runtime on Node 18+, but the
    // DOM BodyInit type is not in scope for the API tsconfig.
    const request = new Request(url, {
      method: req.method ?? "GET",
      headers,
      body: body as unknown as never,
    });

    const response = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: request,
      router: appRouter,
      createContext,
    });

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (err) {
    // Never leak a stack trace to a children's app; log and fail closed.
    console.error("[trpc] handler error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "internal error" }));
  }
}
