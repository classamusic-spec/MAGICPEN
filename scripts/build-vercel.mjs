// ─── Vercel Build Output API packager ───────────────────────────────────────
// Builds the SPA and bundles the two serverless functions into
// .vercel/output, so `vercel deploy --prebuilt` needs no remote install.
//
// Why prebuilt: package-lock.json pins a private npm mirror that is not always
// reachable, so a remote `npm ci` on Vercel fails. Building here sidesteps it.

import { execSync } from "node:child_process";
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".vercel", "output");

console.log("→ cleaning .vercel/output");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "static"), { recursive: true });

console.log("→ building the SPA");
execSync("npx vite build", { stdio: "inherit" });
fs.cpSync(path.join(root, "dist", "public"), path.join(out, "static"), { recursive: true });

/** Bundle one Node serverless function into the Build Output layout. */
async function fn(name, entry, maxDuration = 60) {
  const dir = path.join(out, "functions", "api", `${name}.func`);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`→ bundling function api/${name}`);
  await build({
    entryPoints: [entry],
    outfile: path.join(dir, "index.js"),
    platform: "node",
    target: "node20",
    format: "cjs",
    bundle: true,
    minify: true,
    sourcemap: false,
    // Keep the bundle honest about what it needs at runtime.
    external: [],
    logLevel: "warning",
  });
  fs.writeFileSync(
    path.join(dir, ".vc-config.json"),
    JSON.stringify(
      {
        runtime: "nodejs20.x",
        handler: "index.js",
        launcherType: "Nodejs",
        shouldAddHelpers: false,
        // Image generation measured ~42s end to end, so the default 10s is far
        // too short. 60s is the Hobby ceiling.
        maxDuration,
      },
      null,
      2,
    ),
  );
}

await fn("trpc", "api/vercel/trpc.ts");
await fn("art-proxy", "api/vercel/art-proxy.ts");

console.log("→ writing routing config");
fs.writeFileSync(
  path.join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        // API first, before the static filesystem and the SPA catch-all.
        { src: "/api/trpc(?:/.*)?", dest: "/api/trpc" },
        { src: "/api/art-proxy(?:\\?.*)?", dest: "/api/art-proxy" },
        { handle: "filesystem" },
        // Anything else is a client route: hand back the shell.
        { src: "/.*", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

console.log("✓ .vercel/output ready");
