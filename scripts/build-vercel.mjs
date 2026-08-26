// ─── Vercel Build Output API packager ───────────────────────────────────────
// Builds the SPA into .vercel/output as a purely static site, so
// `vercel deploy --prebuilt` needs no remote install and runs no server.
//
// Magic Pen is client-only: nothing a child does leaves the device, so there
// are no serverless functions to bundle — just the static shell and a SPA
// catch-all. Building here also sidesteps a remote `npm ci`, which fails
// because package-lock.json pins a private npm mirror that is not always
// reachable.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".vercel", "output");

console.log("→ cleaning .vercel/output");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "static"), { recursive: true });

console.log("→ building the SPA");
execSync("npm run build", { stdio: "inherit" });
fs.cpSync(path.join(root, "dist", "public"), path.join(out, "static"), { recursive: true });

console.log("→ writing routing config");
fs.writeFileSync(
  path.join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
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
