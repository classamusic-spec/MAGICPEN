// ─── MAGIC PEN · AI Polish ───────────────────────────────────────────────────
// Turns a child's crayon sketch into a premium storybook-style creature via the
// platform image gateway. Fire-and-poll: `start` kicks off a background job,
// `status` is polled by the client. The crayon creature stays on screen the
// whole time — if anything here fails, the magic never breaks.

import { z } from "zod";
import { createHash } from "crypto";
import { createRouter, publicQuery } from "../middleware";

type JobStatus = "pending" | "ready" | "failed" | "unavailable";

interface Job {
  status: JobStatus;
  url?: string;
  createdAt: number;
}

const jobs = new Map<string, Job>();
const cache = new Map<string, string>(); // sketch hash -> finished art url
const JOB_TTL = 30 * 60 * 1000;
let lastError = ""; // surfaced via health for debugging

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.createdAt > JOB_TTL) jobs.delete(id);
}

const WORLD_STYLE: Record<string, string> = {
  ocean: "dreamy underwater animated-film look, coral-reef candy colors, soft god-ray glow",
  space: "glossy sci-fi animated-film look, neon rim light, deep-space violet and starlight",
  farm: "warm sunny storybook-film look, fresh meadow greens and pastel sky",
  dino: "lush prehistoric adventure-film look, jungle greens with amber volcano glow",
};

function buildPrompt(label: string, worldId: string): string {
  const style = WORLD_STYLE[worldId] ?? "soft 3D plush storybook illustration";
  return [
    `Turn the child's drawing of a ${label} into a premium animated-movie character render.`,
    "Read the drawing's outer lines as the character's silhouette and its inner lines",
    "as details and markings. Render the character FULLY FILLED with real volume —",
    "not line art, not an outline — like a frame from a Pixar-style film:",
    "soft clay-plush material, rich saturated colors taken from the drawing,",
    "gentle rim light, soft subsurface shading, subtle glossy highlights.",
    "CRITICAL: keep the exact same pose, orientation, proportions, silhouette and",
    "color placement as the reference drawing. Do not add, remove, move or 'fix'",
    "any body parts — the child must recognize their own drawing instantly.",
    `World style: ${style}.`,
    "Single character, centered, facing sideways, isolated on a plain white background,",
    "no ground shadow, no text, no scenery.",
  ].join(" ");
}

async function uploadSketch(base: string, key: string, png: Buffer): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "sketch.png");
  const res = await fetch(`${base}/v1/storage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`storage ${res.status}`);
  const json = (await res.json()) as { signed_url?: string };
  if (!json.signed_url) throw new Error("storage: no signed_url");
  return json.signed_url;
}

async function generateArt(
  base: string,
  key: string,
  refUrl: string,
  label: string,
  worldId: string,
): Promise<string> {
  const res = await fetch(`${base}/v1/tools`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "generate_image",
      params: {
        description: buildPrompt(label, worldId),
        ratio: "1:1",
        resolution: "1K",
        background: "transparent",
        reference_image_urls: [refUrl],
      },
    }),
  });
  if (!res.ok) throw new Error(`generate_image ${res.status}`);
  const raw = (await res.json()) as {
    media?: { url?: string };
    result?: { media?: { url?: string } };
    data?: { media?: { url?: string } };
  };
  const url = raw.media?.url ?? raw.result?.media?.url ?? raw.data?.media?.url;
  if (!url) throw new Error("generate_image: no media url");
  return url;
}

// Gateway credentials — server-side only, and only from the environment.
// There is deliberately no hardcoded fallback: a key committed to source is a
// key that leaks. With nothing configured, polish reports "unavailable" and the
// crayon creature simply stays, which is a supported state everywhere.
const DEFAULT_AI_BASE = "https://agent-gw.kimi.com/coding";

function aiCreds(): { key: string; base: string } {
  const key = process.env.KIMI_API_KEY || process.env.DEFAULT_AI_API_KEY || "";
  const raw =
    process.env.KIMI_BASE_URL || process.env.DEFAULT_AI_BASE_URL || DEFAULT_AI_BASE;
  return { key, base: raw.replace(/\/v1\/?$/, "").replace(/\/$/, "") };
}

async function attempt(
  jobId: string, hash: string, png: Buffer, label: string, worldId: string,
  creds: { key: string; base: string },
) {
  const refUrl = await uploadSketch(creds.base, creds.key, png);
  const artUrl = await generateArt(creds.base, creds.key, refUrl, label, worldId);
  cache.set(hash, artUrl);
  jobs.set(jobId, { status: "ready", url: artUrl, createdAt: Date.now() });
}

async function runJob(jobId: string, hash: string, png: Buffer, label: string, worldId: string) {
  try {
    await attempt(jobId, hash, png, label, worldId, aiCreds());
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    console.warn(`[polish] job ${jobId} failed:`, lastError);
    jobs.set(jobId, { status: "failed", createdAt: Date.now() });
  }
}

/* ── best-effort rate limit ───────────────────────────────────────────────
   Generation is billable and this runs on a public URL. Serverless instances
   do not share memory, so this caps a burst per instance rather than globally
   — a speed bump, not a guarantee. A real limit needs a shared store. */
const hits: number[] = [];
const RATE_WINDOW = 60_000;
const RATE_MAX = 20;
function rateLimited(): boolean {
  const now = Date.now();
  while (hits.length && now - hits[0] > RATE_WINDOW) hits.shift();
  if (hits.length >= RATE_MAX) return true;
  hits.push(now);
  return false;
}

/** Shared input shape for both the polling and the one-shot paths. */
const polishInput = z.object({
  jobId: z.string().min(6).max(64),
  image: z.string().max(8_000_000), // data URL, PNG
  label: z.string().min(1).max(40),
  worldId: z.string().min(1).max(20),
});

/** Decode the sketch and derive its cache key, or null if it is not a PNG. */
function decode(input: z.infer<typeof polishInput>) {
  const m = input.image.match(/^data:image\/png;base64,(.+)$/);
  if (!m) return null;
  const png = Buffer.from(m[1], "base64");
  const hash = createHash("sha256")
    .update(png).update(input.label).update(input.worldId).digest("hex");
  return { png, hash };
}

export const polishRouter = createRouter({
  /**
   * One-shot polish: does the upload and the generation inside a single
   * request and returns the finished art.
   *
   * The older start/status pair keeps job state in memory, which only works on
   * a long-lived server — on serverless each request can land on a fresh
   * instance, so the client polls for a job that no longer exists. This path
   * carries no state between requests, at the cost of a slow call (~40s), so
   * the caller needs a matching timeout.
   */
  run: publicQuery
    .input(polishInput)
    .mutation(async ({ input }) => {
      if (!aiCreds().key) return { status: "unavailable" as JobStatus };
      if (rateLimited()) return { status: "failed" as JobStatus };
      const d = decode(input);
      if (!d) return { status: "failed" as JobStatus };
      const cached = cache.get(d.hash);
      if (cached) return { status: "ready" as JobStatus, url: cached };
      try {
        const creds = aiCreds();
        const refUrl = await uploadSketch(creds.base, creds.key, d.png);
        const url = await generateArt(creds.base, creds.key, refUrl, input.label, input.worldId);
        cache.set(d.hash, url);
        return { status: "ready" as JobStatus, url };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn("[polish] run failed:", lastError);
        return { status: "failed" as JobStatus };
      }
    }),

  start: publicQuery
    .input(
      z.object({
        jobId: z.string().min(6).max(64),
        image: z.string().max(8_000_000), // data URL, PNG
        label: z.string().min(1).max(40),
        worldId: z.string().min(1).max(20),
      }),
    )
    .mutation(({ input }) => {
      sweep();
      if (!aiCreds().key) {
        jobs.set(input.jobId, { status: "unavailable", createdAt: Date.now() });
        return { ok: true };
      }
      const m = input.image.match(/^data:image\/png;base64,(.+)$/);
      if (!m) {
        jobs.set(input.jobId, { status: "failed", createdAt: Date.now() });
        return { ok: true };
      }
      const png = Buffer.from(m[1], "base64");
      const hash = createHash("sha256")
        .update(png)
        .update(input.label)
        .update(input.worldId)
        .digest("hex");
      const cached = cache.get(hash);
      if (cached) {
        jobs.set(input.jobId, { status: "ready", url: cached, createdAt: Date.now() });
        return { ok: true };
      }
      jobs.set(input.jobId, { status: "pending", createdAt: Date.now() });
      // fire-and-forget; client polls status
      void runJob(input.jobId, hash, png, input.label, input.worldId);
      return { ok: true };
    }),

  status: publicQuery
    .input(z.object({ jobId: z.string().min(6).max(64) }))
    .query(({ input }) => {
      sweep();
      const job = jobs.get(input.jobId);
      if (!job) return { status: "failed" as JobStatus };
      return { status: job.status, url: job.url };
    }),

  // diagnostics: is the image gateway configured/reachable from this runtime?
  health: publicQuery.query(() => ({
    configured: Boolean(aiCreds().key),
    source: process.env.DEFAULT_AI_API_KEY ? "portal" : process.env.KIMI_API_KEY ? "env" : "fallback",
    lastError: lastError || null,
    jobsActive: [...jobs.values()].filter((j) => j.status === "pending").length,
  })),
});
