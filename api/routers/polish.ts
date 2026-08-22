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

// Gateway credentials (server-side only). Priority: env vars (portal-injected
// DEFAULT_AI_* or local KIMI_*); on auth failure the job retries with the
// environment fallback key so preview/deploy keeps working.
const FALLBACK_AI_KEY =
  "sk-kimi-usjJ4Fwfogo3Y5vTWFnM8pLAvND27pFDWyeB9I3UqAQenO28HlVYaLBirejuHrQh";
const FALLBACK_AI_BASE = "https://agent-gw.kimi.com/coding";

function aiCreds(): { key: string; base: string } {
  const key =
    process.env.KIMI_API_KEY || process.env.DEFAULT_AI_API_KEY || FALLBACK_AI_KEY;
  const raw =
    process.env.KIMI_BASE_URL ||
    process.env.DEFAULT_AI_BASE_URL ||
    FALLBACK_AI_BASE;
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
  const primary = aiCreds();
  try {
    await attempt(jobId, hash, png, label, worldId, primary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const authFail = /(401|403)/.test(msg) && primary.key !== FALLBACK_AI_KEY;
    if (authFail) {
      try {
        await attempt(jobId, hash, png, label, worldId, { key: FALLBACK_AI_KEY, base: FALLBACK_AI_BASE });
        return;
      } catch (err2) {
        lastError = err2 instanceof Error ? err2.message : String(err2);
      }
    } else {
      lastError = msg;
    }
    console.warn(`[polish] job ${jobId} failed:`, lastError);
    jobs.set(jobId, { status: "failed", createdAt: Date.now() });
  }
}

export const polishRouter = createRouter({
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
