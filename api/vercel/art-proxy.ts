// ─── Vercel serverless entry: art proxy ─────────────────────────────────────
// Generated-image hosts send no CORS headers, so the canvas cannot read the
// pixels to cut the background out. This re-serves the image same-origin.
//
// The allowlist is anchored and escapes its dots. The original expression used
// unescaped dots, so `https://www-kimi.com/` and `https://kimi-web-img-x.cn/`
// both slipped through — and because the upstream Content-Type was echoed back
// verbatim, an attacker-controlled host could have served text/html on this
// app's own origin. Content-Type is now pinned to a known image type.

import type { IncomingMessage, ServerResponse } from "node:http";

const ALLOWED = /^https:\/\/(kimi-web-img\.moonshot\.cn|www\.kimi\.com)\//;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 12 * 1024 * 1024;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `https://${host}`);
  const target = url.searchParams.get("url") ?? "";

  const fail = (code: number, msg: string) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: msg }));
  };

  if (!ALLOWED.test(target)) return fail(400, "host not allowed");

  try {
    const upstream = await fetch(target, { redirect: "error" });
    if (!upstream.ok) return fail(502, "upstream failed");

    const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!IMAGE_TYPES.has(type)) return fail(502, "not an image");

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return fail(502, "too large");

    res.statusCode = 200;
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(buf);
  } catch {
    fail(502, "upstream failed");
  }
}
