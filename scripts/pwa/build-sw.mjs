// ─── Build the service worker ───────────────────────────────────────────────
// Runs after `vite build`. Walks the real build output, works out which files
// make up the app shell, and writes them into the worker as its precache list.
//
// The list is generated rather than hand-written because vite's chunk names
// carry a content hash: a hand-kept list would go stale on the next build and
// the app would quietly stop working offline, which is the kind of failure
// nobody notices until a child is on a plane.
//
// The version string is a hash of that list, so the worker changes exactly when
// the shell changes — no more often (a needless redownload) and no less (a
// stale app).

import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { createHash } from "crypto";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DIST = join(ROOT, "dist", "public");

/** Everything under `dir`, as paths relative to the build root. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push("/" + relative(DIST, p).split("\\").join("/"));
  }
  return out;
}

const all = walk(DIST);

/**
 * The shell: everything needed to open the app and reach every screen with no
 * network. Deliberately excludes the voice clips — see the note in the worker
 * about not spending 5MB of a parent's data before they have decided they like
 * the app.
 */
const shell = all.filter((p) => {
  if (p.startsWith("/voice/clips/")) return false;   // cached as they are played
  if (p === "/sw.js") return false;                  // never precache the worker itself
  return (
    p === "/index.html" ||
    p === "/privacy.html" ||
    p === "/manifest.webmanifest" ||
    p === "/voice/manifest.json" ||                  // small; the voice needs it to look anything up
    p.startsWith("/assets/") ||
    p.startsWith("/fonts/") ||
    p.startsWith("/icons/")
  );
});

// "/" and "/index.html" are the same document but different cache keys, and a
// launched-from-home-screen app asks for "/"
const precache = Array.from(new Set(["/", ...shell])).sort();

const bytes = shell.reduce((n, p) => n + statSync(join(DIST, p.slice(1))).size, 0);
const version = createHash("sha1").update(precache.join("\n")).digest("hex").slice(0, 12);

const template = readFileSync(join(HERE, "sw-template.js"), "utf8");
const sw = template
  .replace("__VERSION__", version)
  .replace("__PRECACHE__", JSON.stringify(precache, null, 2));

if (sw.includes("__VERSION__") || sw.includes("__PRECACHE__")) {
  console.error("sw-template.js placeholders were not all replaced");
  process.exit(1);
}

writeFileSync(join(DIST, "sw.js"), sw);

const clips = all.filter((p) => p.startsWith("/voice/clips/")).length;
console.log(
  `sw.js: ${precache.length} shell files precached (${(bytes / 1024 / 1024).toFixed(2)}MB), ` +
    `${clips} voice clips cached on play, version ${version}`,
);
