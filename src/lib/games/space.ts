// ─── SPACE mini-games: Star Rush · Astro Lanes · Orbit Hop ──────────────────
// Difficulty rides `prog` (0→1 over the 60s round); each game unlocks a new
// hazard at ~20s and ~40s. Every size scales with `f.sizeF` and every speed is
// expressed in screens-per-second, so portrait and landscape play identically.
import {
  clamp, clamp01, lerp, rnd, star5,
  type Frame, type GameAPI, type GameInstance, type GameMeta,
} from "./core";

export const SPACE_GAMES: GameMeta[] = [
    { id: "starRush", title: "Star Rush", emoji: "⭐", how: "DRAG to fly anywhere. Scoop up stars, dodge the lumpy rocks — grab a MAGNET and every star flies to you!" },
    { id: "astroLanes", title: "Astro Lanes", emoji: "🛸", how: "TAP a lane to zip into it. Stars are yum, rocks are ouch. Four stars without switching lanes = big bonus!" },
    { id: "orbitHop", title: "Orbit Hop", emoji: "🪐", how: "TAP when your ring glows GREEN and you'll fly straight to the next planet. Scoop up gems on the way!" },
];

/* ── local juice helpers ───────────────────────────────────────────────── */

const prog60 = (t: number) => clamp01(t / 60);
const TAU = Math.PI * 2;
const INK = "rgba(24,18,44,0.85)";

function inkStroke(ctx: CanvasRenderingContext2D, w: number) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = w;
  ctx.lineJoin = "round";
}

function reward(api: GameAPI, x: number, y: number, n: number, col: string, big = false) {
  api.score(n);
  const m = api.combo();
  api.burst(x, y, col, big ? 30 : 13);
  api.pop(x, y, `+${n * m}`, col);
  api.shake(big ? 0.5 : 0.12);
  return m;
}

function praise(streak: number): string | null {
  if (streak === 4) return "NICE!";
  if (streak === 8) return "SUPER!";
  if (streak === 13) return "AMAZING!";
  if (streak > 13 && streak % 6 === 0) return "WOW!";
  return null;
}

function warnChevron(
  ctx: CanvasRenderingContext2D, x: number, y: number, sizeF: number,
  t: number, rot: number, col: string,
) {
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 15));
  ctx.translate(x, y);
  ctx.rotate(rot);
  const s = 14 * sizeF;
  ctx.fillStyle = col;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(s * 0.75, 0);
  ctx.lineTo(-s * 0.5, -s * 0.8);
  ctx.lineTo(-s * 0.5, s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const angDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};

/* ── painters — pickups are STARRY/ROUND, hazards are JAGGED ────────────── */

function paintStarPickup(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  const pu = 1 + Math.sin(t * 6 + seed) * 0.09;
  ctx.scale(pu, 1 / pu);
  ctx.globalAlpha = 0.3 + 0.2 * Math.sin(t * 5 + seed);
  ctx.fillStyle = "#fff3c4";
  star5(ctx, 0, 0, r * 1.35, t + seed);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffe066";
  star5(ctx, 0, 0, r, t + seed);
  ctx.save();
  ctx.translate(0, 0);
  ctx.rotate(t + seed);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  inkStroke(ctx, 3);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function paintSuperStar(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  ctx.globalAlpha = 0.28 + 0.22 * Math.sin(t * 7 + seed);
  ctx.fillStyle = "#ff9ad5";
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r * 1.25);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.5, "#ffd65a");
  g.addColorStop(1, "#fb66e5");
  ctx.fillStyle = g;
  star5(ctx, 0, 0, r * 1.25, -t * 1.4 + seed);
  ctx.fillStyle = "#fff";
  star5(ctx, 0, 0, r * 0.5, t * 2 + seed);
  ctx.restore();
}

function paintRock(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  ctx.rotate(t * 0.7 + seed);
  ctx.fillStyle = "#8d8399";
  ctx.beginPath();
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU;
    const rad = r * (0.72 + ((k * 37 + seed * 13) % 10) / 30);
    if (k === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
  inkStroke(ctx, 3.4);
  ctx.stroke();
  ctx.fillStyle = "#6f6579";
  ctx.beginPath();
  ctx.arc(-r * 0.22, -r * 0.12, r * 0.2, 0, TAU);
  ctx.arc(r * 0.26, r * 0.22, r * 0.14, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ff8a5c";
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, -r * 0.55);
  ctx.lineTo(r * 0.12, -r * 0.3);
  ctx.lineTo(-r * 0.3, -r * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintMagnet(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  ctx.rotate(Math.sin(t * 3 + seed) * 0.3);
  ctx.globalAlpha = 0.3 + 0.25 * Math.sin(t * 8 + seed);
  ctx.fillStyle = "#7ef0e2";
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.6, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#00c2b9";
  ctx.lineWidth = r * 0.5;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.arc(0, r * 0.15, r * 0.72, Math.PI, 0);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(0, r * 0.15, r * 0.97, Math.PI, 0);
  ctx.arc(0, r * 0.15, r * 0.47, 0, Math.PI, true);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillRect(-r * 0.97, r * 0.15, r * 0.5, r * 0.42);
  ctx.fillStyle = "#ff5c8a";
  ctx.fillRect(r * 0.47, r * 0.15, r * 0.5, r * 0.42);
  ctx.strokeRect(-r * 0.97, r * 0.15, r * 0.5, r * 0.42);
  ctx.strokeRect(r * 0.47, r * 0.15, r * 0.5, r * 0.42);
  ctx.restore();
}

function paintComet(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  const g = ctx.createLinearGradient(r * 3.4, 0, -r * 0.5, 0);
  g.addColorStop(0, "rgba(255,120,90,0)");
  g.addColorStop(1, "rgba(255,190,90,0.85)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(r * 3.4, 0);
  ctx.lineTo(0, -r * 0.85);
  ctx.lineTo(0, r * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-t * 4 + seed);
  ctx.fillStyle = "#ff6b4a";
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU;
    const rad = r * (0.78 + ((k * 29 + seed * 7) % 8) / 26);
    if (k === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
  inkStroke(ctx, 3);
  ctx.stroke();
  ctx.restore();
}

function paintGem(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  ctx.rotate(t * 1.6 + seed);
  const pu = 1 + Math.sin(t * 6 + seed) * 0.1;
  ctx.scale(pu, 1 / pu);
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#7ef0e2";
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, "#d7fff9");
  g.addColorStop(1, "#00c2b9");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.72, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r * 0.72, 0);
  ctx.closePath();
  ctx.fill();
  inkStroke(ctx, 2.6);
  ctx.stroke();
  ctx.restore();
}

/* ══ SPACE 1 · Star Rush ═══════════════════════════════════════════════════
   Drag to fly. NEW: a rare MAGNET drags every star to you for 5 seconds —
   worth crossing the rock field for.                                       */

interface Sp {
  x: number; y: number; r: number; seed: number;
  kind: 0 | 1 | 2 | 3 | 4; // 0 star · 1 super star · 2 rock · 3 magnet · 4 comet
  warn: number; scored: boolean;
}

function starRush(): GameInstance {
  const ents: Sp[] = [];
  let hx = 0.25, hy = 0.5, spawnT = 0.4, magnetT = 0, magCool = 9, cometT = 0, streak = 0;

  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    hint: "Drag to fly · grab the magnet!",
    update(f, inp, api) {
      const prog = prog60(f.t);
      const botY = f.floorY / f.H - 0.04;
      const k = Math.min(1, f.dt * 9);
      hx += (inp.x - hx) * k;
      hy += (inp.y - hy) * k;
      hx = clamp(hx, 0.06, 0.94);
      hy = clamp(hy, 0.07, botY);
      g.heroX = hx * f.W;
      g.heroY = hy * f.H;
      g.tilt = clamp((inp.x - hx) * 1.6, -0.42, 0.42);
      magnetT = Math.max(0, magnetT - f.dt);
      magCool = Math.max(0, magCool - f.dt);

      /* ── spawning ──────────────────────────────────────────────────── */
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const haz = f.t < 5 ? 0 : lerp(0.24, 0.46, prog);
        if (f.t > 9 && magCool <= 0 && magnetT <= 0 && rnd() < 0.35) {
          magCool = 13;
          ents.push({ x: 1.08, y: lerp(0.12, botY - 0.02, rnd()), r: 22, seed: rnd() * 10, kind: 3, warn: 0, scored: false });
        } else if (rnd() < haz) {
          if (f.t > 20 && rnd() < 0.42) {
            /* rock wall — a hole at least 0.42H tall is always left open */
            const gapC = lerp(0.26, Math.max(0.28, botY - 0.26), rnd());
            for (const s of [-1, 1]) {
              for (let i = 0; i < 2; i++) {
                const y = gapC + s * (0.22 + i * 0.17);
                if (y < 0.06 || y > botY) continue;
                ents.push({ x: 1.3 + i * 0.02, y, r: 25, seed: rnd() * 10, kind: 2, warn: 0, scored: false });
              }
            }
          } else {
            ents.push({ x: 1.3, y: lerp(0.09, botY, rnd()), r: 27, seed: rnd() * 10, kind: 2, warn: 0, scored: false });
          }
        } else {
          const run = rnd() < 0.5 ? 3 : 1;
          const base = lerp(0.1, botY - 0.02, rnd());
          const sup = f.t > 12 && rnd() < 0.08;
          for (let i = 0; i < run; i++) {
            ents.push({
              x: 1.07 + i * 0.075,
              y: clamp(base + Math.sin(i * 1.2) * 0.05, 0.08, botY),
              r: sup ? 24 : 20, seed: rnd() * 10, kind: sup ? 1 : 0, warn: 0, scored: false,
            });
          }
        }
        spawnT = lerp(0.85, 0.42, prog) * (0.78 + rnd() * 0.44);
      }
      /* comets: the late-round hazard, always telegraphed for 0.9s */
      if (f.t > 38) {
        cometT -= f.dt;
        if (cometT <= 0 && ents.filter((e) => e.kind === 4).length < 2) {
          cometT = lerp(5.5, 3.2, prog) * (0.8 + rnd() * 0.5);
          ents.push({ x: 1.12, y: lerp(0.12, botY - 0.02, rnd()), r: 22, seed: rnd() * 10, kind: 4, warn: 0.9, scored: false });
        }
      }
      if (ents.length > 46) ents.splice(0, ents.length - 46);

      /* ── motion + collisions ───────────────────────────────────────── */
      const sp = lerp(0.34, 0.6, prog);
      const heroR = 44 * f.sizeF;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        if (e.warn > 0) { e.warn -= f.dt; continue; }
        e.x -= (e.kind === 4 ? 1.3 : sp) * f.dt;
        if (magnetT > 0 && e.kind <= 1) {
          const ex0 = e.x * f.W, ey0 = e.y * f.H;
          const dx = g.heroX - ex0, dy = g.heroY - ey0;
          const d = Math.hypot(dx, dy) || 1;
          const pull = 640 * f.sizeF * f.dt;
          e.x += (dx / d * pull) / f.W;
          e.y += (dy / d * pull) / f.H;
        }
        if (e.x < -0.14) { ents.splice(i, 1); continue; }
        const ex = e.x * f.W, ey = e.y * f.H, er = e.r * f.sizeF;
        const d = Math.hypot(ex - g.heroX, ey - g.heroY);
        if (e.kind === 2 || e.kind === 4) {
          if (d < heroR * 0.62 + er * 0.62) {
            ents.splice(i, 1);
            streak = 0;
            api.burst(ex, ey, "#ff8a5c", 20);
            api.hurt();
          } else if (!e.scored && ex < g.heroX - er * 0.5) {
            e.scored = true;
            if (Math.abs(ey - g.heroY) < (heroR + er) * 1.5) {
              api.score(2);
              api.pop(g.heroX, g.heroY - 40 * f.sizeF, "WHOOSH!", "#7ef0e2");
              api.blip();
            }
          }
          continue;
        }
        if (d < heroR * 0.95 + er) {
          ents.splice(i, 1);
          if (e.kind === 3) {
            magnetT = 5;
            api.burst(ex, ey, "#7ef0e2", 30);
            api.pop(ex, ey - 30 * f.sizeF, "MAGNET!", "#7ef0e2");
            api.shake(0.4);
            continue;
          }
          streak++;
          reward(api, ex, ey, e.kind === 1 ? 40 : 10, e.kind === 1 ? "#fb66e5" : "#ffe066", e.kind === 1);
          if (e.kind === 1) api.pop(ex, ey - 34 * f.sizeF, "SUPER STAR!", "#fff3c4");
          const p = praise(streak);
          if (p) api.pop(g.heroX, g.heroY - 46 * f.sizeF, p, "#fb66e5");
        }
      }
    },
    draw(ctx, f) {
      for (const e of ents) {
        if (e.warn > 0 || e.x > 1.06) continue;
        ctx.save();
        ctx.translate(e.x * f.W, e.y * f.H);
        const r = e.r * f.sizeF;
        if (e.kind === 0) paintStarPickup(ctx, r, f.t, e.seed);
        else if (e.kind === 1) paintSuperStar(ctx, r, f.t, e.seed);
        else if (e.kind === 2) paintRock(ctx, r, f.t, e.seed);
        else if (e.kind === 3) paintMagnet(ctx, r, f.t, e.seed);
        else paintComet(ctx, r, f.t, e.seed);
        ctx.restore();
      }
    },
    drawFront(ctx, f) {
      for (const e of ents) {
        const y = clamp(e.y * f.H, 30 * f.sizeF, f.floorY);
        if (e.warn > 0) {
          /* comet inbound: dashed track + a fat chevron */
          ctx.save();
          ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(f.t * 16));
          ctx.strokeStyle = "#ff4d6d";
          ctx.lineWidth = 3 * f.sizeF;
          ctx.setLineDash([14 * f.sizeF, 12 * f.sizeF]);
          ctx.beginPath();
          ctx.moveTo(f.W, y);
          ctx.lineTo(0, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
          warnChevron(ctx, f.W - 18 * f.sizeF, y, f.sizeF * 1.5, f.t, Math.PI, "#ff4d6d");
        } else if (e.x > 1.02) {
          const bad = e.kind === 2;
          warnChevron(ctx, f.W - 16 * f.sizeF, y, f.sizeF, f.t, Math.PI, bad ? "#ff4d6d" : "#ffe066");
        }
      }
      if (magnetT > 0) {
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(f.t * 9);
        ctx.strokeStyle = "#7ef0e2";
        ctx.lineWidth = 3 * f.sizeF;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.arc(g.heroX, g.heroY, (54 + i * 26 + Math.sin(f.t * 6 - i) * 6) * f.sizeF, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.9;
        ctx.font = `900 ${Math.round(11 * f.sizeF) + 7}px 'Baloo 2', sans-serif`;
        ctx.fillStyle = "#7ef0e2";
        ctx.textAlign = "center";
        ctx.fillText(`MAGNET ${magnetT.toFixed(1)}s`, g.heroX, g.heroY - 62 * f.sizeF);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  };
  return g;
}

/* ══ SPACE 2 · Astro Lanes ═════════════════════════════════════════════════
   Tap a lane to jump to it. Starts as three lanes; a FOURTH opens at 20s.
   NEW: four stars without switching lanes pays a Lane Bonus.               */

interface Ln {
  x: number; ly: number; lane: number; r: number; seed: number;
  good: boolean; big: boolean; scored: boolean;
}

function laneYs(n: number): number[] {
  const y0 = 0.17, y1 = 0.76;
  return Array.from({ length: n }, (_, i) => (n > 1 ? lerp(y0, y1, i / (n - 1)) : (y0 + y1) / 2));
}

function astroLanes(): GameInstance {
  const ents: Ln[] = [];
  let laneN = 3, lane = 1, hy = 0.46, spawnT = 0.5, chain = 0, streak = 0;
  let pendingY = -1, grace = 0, openFlash = 0, lastHazX = 0, init = false;

  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    hint: "Tap where you want to fly · 4 stars in one lane = bonus",
    onDown(_f, inp) { pendingY = inp.y; }, // buffered so a tap is never lost
    update(f, _inp, api) {
      const prog = prog60(f.t);
      const ys = laneYs(laneN);
      if (!init) { hy = ys[lane]; init = true; }

      /* a fourth lane opens at 20s — the mid-round shake-up */
      if (laneN === 3 && f.t > 20) {
        laneN = 4;
        const nys = laneYs(4);
        let bi = 0;
        nys.forEach((y, i) => { if (Math.abs(y - hy) < Math.abs(nys[bi] - hy)) bi = i; });
        lane = bi;
        for (const e of ents) {
          let ei = 0;
          nys.forEach((y, i) => { if (Math.abs(y - e.ly) < Math.abs(nys[ei] - e.ly)) ei = i; });
          if (!e.big) { e.lane = ei; e.ly = nys[ei]; }
        }
        openFlash = 1.6;
        api.pop(f.W * 0.5, f.H * 0.5, "NEW LANE!", "#7ef0e2");
        api.burst(f.W * 0.5, laneYs(4)[3] * f.H, "#7ef0e2", 24);
      }
      openFlash = Math.max(0, openFlash - f.dt);
      grace = Math.max(0, grace - f.dt);

      if (pendingY >= 0) {
        const cy = laneYs(laneN);
        let bi = 0;
        cy.forEach((y, i) => { if (Math.abs(y - pendingY) < Math.abs(cy[bi] - pendingY)) bi = i; });
        if (bi !== lane) { chain = 0; grace = 0.18; api.blip(); }
        lane = bi;
        pendingY = -1;
      }

      const cy = laneYs(laneN);
      const prev = hy;
      hy += (cy[lane] - hy) * Math.min(1, f.dt * 11);
      g.heroX = f.W * 0.22;
      g.heroY = hy * f.H;
      g.tilt = clamp((hy - prev) * 26, -0.45, 0.45);

      /* ── waves ─────────────────────────────────────────────────────── */
      const sp = lerp(0.34, 0.62, prog);
      lastHazX -= sp * f.dt;
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const haz = f.t < 5 ? 0 : lerp(0.3, 0.5, prog);
        if (rnd() < haz && lastHazX < 0.72) {
          /* never block more than laneN-2 lanes: two escapes always remain */
          const maxHaz = laneN - 2;
          const bigOK = f.t > 40 && laneN >= 4 && maxHaz >= 2;
          const picks: number[] = [];
          const pool = [...Array(laneN).keys()];
          if (bigOK && rnd() < 0.4) {
            const top = (rnd() * (laneN - 1)) | 0;
            ents.push({
              x: 1.08, ly: (cy[top] + cy[top + 1]) / 2, lane: top, r: 40,
              seed: rnd() * 10, good: false, big: true, scored: false,
            });
          } else {
            const count = Math.min(maxHaz, f.t > 20 ? 1 + ((rnd() < 0.45) ? 1 : 0) : 1);
            for (let i = 0; i < count && pool.length; i++) {
              picks.push(pool.splice((rnd() * pool.length) | 0, 1)[0]);
            }
            for (const p of picks) {
              ents.push({ x: 1.08 + rnd() * 0.04, ly: cy[p], lane: p, r: 26, seed: rnd() * 10, good: false, big: false, scored: false });
            }
          }
          lastHazX = 1.08;
        } else {
          const p = (rnd() * laneN) | 0;
          const run = 1 + ((rnd() * 3) | 0);
          for (let i = 0; i < run; i++) {
            ents.push({ x: 1.06 + i * 0.085, ly: cy[p], lane: p, r: 21, seed: rnd() * 10, good: true, big: false, scored: false });
          }
        }
        spawnT = lerp(0.85, 0.4, prog) * (0.8 + rnd() * 0.4);
      }
      if (ents.length > 44) ents.splice(0, ents.length - 44);

      /* ── motion + collisions (elliptical: lanes stay meaningful) ────── */
      const gap = (cy.length > 1 ? cy[1] - cy[0] : 0.2) * f.H;
      const heroR = 44 * f.sizeF;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        e.x -= sp * f.dt;
        if (e.x < -0.12) { ents.splice(i, 1); continue; }
        const ex = e.x * f.W, ey = e.ly * f.H, er = e.r * f.sizeF;
        const dx = Math.abs(ex - g.heroX), dy = Math.abs(ey - g.heroY);
        if (e.good) {
          if (dx < heroR + er && dy < gap * 0.46) {
            ents.splice(i, 1);
            streak++;
            chain = e.lane === lane ? chain + 1 : 1;
            reward(api, ex, ey, 10, "#ffe066");
            if (chain >= 4) {
              chain = 0;
              api.score(30);
              api.burst(g.heroX, g.heroY, "#7ef0e2", 30);
              api.pop(g.heroX, g.heroY - 54 * f.sizeF, "LANE BONUS!", "#7ef0e2");
              api.shake(0.45);
            }
            const p = praise(streak);
            if (p) api.pop(g.heroX, g.heroY - 46 * f.sizeF, p, "#fb66e5");
          }
          continue;
        }
        const hitDy = gap * (e.big ? 0.86 : 0.4);
        if (dx < heroR * 0.6 + er * 0.6 && dy < hitDy) {
          /* late-tap forgiveness: you just asked to leave this lane */
          if (grace > 0 && e.lane !== lane) {
            ents.splice(i, 1);
            api.score(2);
            api.burst(ex, ey, "#7ef0e2", 12);
            api.pop(ex, ey - 26 * f.sizeF, "DODGE!", "#7ef0e2");
            continue;
          }
          ents.splice(i, 1);
          streak = 0; chain = 0;
          api.burst(ex, ey, "#ff8a5c", 20);
          api.hurt();
          continue;
        }
        if (!e.scored && ex < g.heroX - er * 0.5) {
          e.scored = true;
          if (dy < gap * 1.1) {
            api.score(2);
            api.pop(g.heroX, g.heroY - 40 * f.sizeF, "WHOOSH!", "#7ef0e2");
            api.blip();
          }
        }
      }
    },
    draw(ctx, f) {
      const cy = laneYs(laneN);
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 14]);
      cy.forEach((fr, i) => {
        const fresh = laneN === 4 && i === 3 && openFlash > 0;
        ctx.strokeStyle = fresh
          ? `rgba(126,240,226,${0.3 + 0.5 * Math.sin(f.t * 14)})`
          : i === lane ? "rgba(255,230,102,0.35)" : "rgba(180,170,255,0.16)";
        ctx.beginPath();
        ctx.moveTo(0, fr * f.H);
        ctx.lineTo(f.W, fr * f.H);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.restore();
      for (const e of ents) {
        if (e.x > 1.06) continue;
        ctx.save();
        ctx.translate(e.x * f.W, e.ly * f.H);
        const r = e.r * f.sizeF;
        if (e.good) paintStarPickup(ctx, r, f.t, e.seed);
        else paintRock(ctx, r * (e.big ? 1.5 : 1), f.t, e.seed);
        ctx.restore();
      }
    },
    drawFront(ctx, f) {
      for (const e of ents) {
        if (e.x <= 1.02) continue;
        warnChevron(
          ctx, f.W - 16 * f.sizeF, clamp(e.ly * f.H, 30 * f.sizeF, f.floorY),
          f.sizeF * (e.big ? 1.4 : 1), f.t, Math.PI, e.good ? "#ffe066" : "#ff4d6d",
        );
      }
      /* lane-chain pips under the hero */
      if (chain > 0) {
        ctx.save();
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i < chain ? "#7ef0e2" : "rgba(255,255,255,0.25)";
          ctx.beginPath();
          ctx.arc(g.heroX + (i - 1.5) * 13 * f.sizeF, g.heroY + 44 * f.sizeF, 4.5 * f.sizeF, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  };
  return g;
}

/* ══ SPACE 3 · Orbit Hop ═══════════════════════════════════════════════════
   Ride an orbit, tap to launch. The launch window is painted GREEN on the
   ring, and a dotted preview shows exactly where you'd go — tap inside it and
   the hop is guaranteed. NEW: gems float off the direct line, so a wilder
   launch angle is worth more.                                              */

interface Planet { x: number; y: number; r: number; c1: string; c2: string; seed: number; bob: number }
interface Gem { x: number; y: number; got: boolean; seed: number }
interface Rock { x: number; y: number; vx: number; vy: number; r: number; seed: number; warn: number }

const PALETTES: [string, string][] = [
  ["#ffd65a", "#ff9d5c"], ["#7ef0e2", "#0fa8a0"],
  ["#ff9ad5", "#c74bb8"], ["#b3c6ff", "#5f7de0"],
];

function orbitHop(): GameInstance {
  let cur: Planet | null = null, next: Planet | null = null;
  const gems: Gem[] = [], rocks: Rock[] = [];
  let ang = 0, mode: "orbit" | "fly" = "orbit";
  let px = 0, py = 0, vx = 0, vy = 0, flightT = 0;
  let assisted = false, perfect = false, pending = false;
  let streak = 0, rockT = 4;

  const omega = (t: number) => lerp(1.55, 2.15, prog60(t));
  const win = (t: number) => lerp(0.58, 0.42, prog60(t));
  const pY = (p: Planet, f: Frame) => p.y + Math.sin(f.t * 0.8 + p.seed) * p.bob;
  const orbR = (f: Frame) => cur!.r + 32 * f.sizeF;
  const orbPos = (a: number, f: Frame) => ({
    x: cur!.x + Math.cos(a) * orbR(f),
    y: pY(cur!, f) + Math.sin(a) * orbR(f),
  });
  /** How far off is a launch at angle `a` from pointing at the target? */
  const aimErr = (a: number, f: Frame) => {
    const p = orbPos(a, f);
    const tx = -Math.sin(a), ty = Math.cos(a);
    return angDiff(Math.atan2(ty, tx), Math.atan2(pY(next!, f) - p.y, next!.x - p.x));
  };

  const spawnNext = (f: Frame) => {
    const prog = prog60(f.t);
    const pal = PALETTES[(rnd() * PALETTES.length) | 0];
    const dist = f.W * lerp(0.34, 0.5, prog) * (0.86 + rnd() * 0.28);
    next = {
      x: clamp(cur!.x + dist, f.W * 0.46, f.W * 0.86),
      y: clamp(f.H * (0.18 + rnd() * 0.44), f.H * 0.16, f.floorY - 0.08 * f.H),
      r: lerp(38, 27, prog) * f.sizeF * (0.88 + rnd() * 0.26),
      c1: pal[0], c2: pal[1], seed: rnd() * 10,
      bob: f.t > 40 ? 0.045 * f.H : 0,
    };
    /* gems: one near the straight line, two that need a braver angle */
    gems.length = 0;
    const ax = cur!.x, ay = pY(cur!, f);
    const dx = next.x - ax, dy = next.y - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    for (let i = 0; i < 3; i++) {
      const u = 0.3 + i * 0.2;
      const off = (i === 0 ? (rnd() - 0.5) * 0.06 : (rnd() < 0.5 ? -1 : 1) * (0.11 + rnd() * 0.1)) * len;
      gems.push({
        x: ax + dx * u + nx * off,
        y: clamp(ay + dy * u + ny * off, f.H * 0.1, f.floorY - 0.05 * f.H),
        got: false, seed: rnd() * 10,
      });
    }
  };

  /** Best launch angle on the ring right now (the centre of the green arc). */
  const bestAngle = (f: Frame) => {
    let bestA = -Math.PI / 2, bestE = 9;
    for (let k = 0; k < 128; k++) {
      const a = (k / 128) * TAU;
      const e = Math.abs(aimErr(a, f));
      if (e < bestE) { bestE = e; bestA = a; }
    }
    return bestA;
  };

  const toOrbit = (f: Frame, regroup = false) => {
    mode = "orbit";
    flightT = 0;
    /* after a whiff you are handed a fresh window ~0.9s away, so a miss costs
       a beat rather than a random wait */
    ang = regroup
      ? bestAngle(f) - omega(f.t) * 0.9
      : Math.atan2(py - pY(cur!, f), px - cur!.x);
    if (!Number.isFinite(ang)) ang = -Math.PI / 2;
  };

  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 0.85,
    hint: "Tap while the ring glows GREEN",
    onDown() { pending = true; }, // buffered: taps between frames still count
    update(f, _inp, api) {
      const prog = prog60(f.t);
      const U = Math.min(f.W, f.H);
      if (!cur) {
        cur = { x: f.W * 0.28, y: f.H * 0.45, r: 36 * f.sizeF, c1: "#c79bff", c2: "#8b46c7", seed: 0, bob: 0 };
        spawnNext(f);
        /* start the round with a launch window ~1.1s away */
        ang = bestAngle(f) - omega(0) * 1.1;
      }
      const T = () => ({ x: next!.x, y: pY(next!, f) });

      /* ── drifting rocks (20s+) — only dangerous while flying, so waiting
            in orbit is always a safe option ──────────────────────────── */
      if (f.t > 20) {
        rockT -= f.dt;
        if (rockT <= 0 && rocks.length < 4) {
          rockT = lerp(4.5, 2.4, prog) * (0.8 + rnd() * 0.5);
          rocks.push({
            x: f.W + 40 * f.sizeF, y: f.H * (0.16 + rnd() * 0.6),
            vx: -f.W * lerp(0.16, 0.26, prog), vy: (rnd() - 0.5) * f.H * 0.06,
            r: 20 * f.sizeF, seed: rnd() * 10, warn: 0.8,
          });
        }
      }
      for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        if (r.warn > 0) { r.warn -= f.dt; continue; }
        r.x += r.vx * f.dt;
        r.y = clamp(r.y + r.vy * f.dt, f.H * 0.1, f.floorY - 0.04 * f.H);
        if (r.x < -60 * f.sizeF) rocks.splice(i, 1);
      }
      if (rocks.length > 6) rocks.splice(0, rocks.length - 6);

      if (mode === "orbit") {
        ang += omega(f.t) * f.dt;
        if (ang > TAU * 4) ang -= TAU * 4;
        const p = orbPos(ang, f);
        px = p.x; py = p.y;
        g.tilt = ang + Math.PI / 2;
        if (pending) {
          pending = false;
          /* forgive a late tap by rewinding the launch angle 0.1s */
          const aEff = ang - omega(f.t) * 0.1;
          const q = orbPos(aEff, f);
          const tgt = T();
          const dx = tgt.x - q.x, dy = tgt.y - q.y;
          const dist = Math.hypot(dx, dy) || 1;
          const err = Math.abs(aimErr(aEff, f));
          px = q.x; py = q.y;
          mode = "fly"; flightT = 0;
          if (err < win(f.t)) {
            assisted = true;
            perfect = err < win(f.t) * 0.34;
            const speed = dist / lerp(0.85, 0.62, prog);
            vx = (dx / dist) * speed; vy = (dy / dist) * speed;
          } else {
            assisted = false; perfect = false;
            const speed = dist / 1.05;
            vx = -Math.sin(aEff) * speed; vy = Math.cos(aEff) * speed;
          }
          api.burst(px, py, assisted ? "#7ef0e2" : "#ffd65a", assisted ? 16 : 9);
          api.blip();
        }
      } else {
        flightT += f.dt;
        const tgt = T();
        const dx = tgt.x - px, dy = tgt.y - py;
        const d = Math.hypot(dx, dy) || 1;
        if (assisted) {
          /* a guaranteed hop: keep steering at the planet, speed unchanged */
          const sp = Math.hypot(vx, vy) || 1;
          vx = (dx / d) * sp; vy = (dy / d) * sp;
        } else {
          const pull = 1.05 * U;
          vx += (dx / d) * pull * f.dt;
          vy += (dy / d) * pull * f.dt;
          /* capture funnel: once you are close, the planet reels you in */
          if (d < next!.r + 150 * f.sizeF) {
            const sp0 = Math.hypot(vx, vy) || 1;
            const na = Math.atan2(vy, vx) + angDiff(Math.atan2(dy, dx), Math.atan2(vy, vx)) * Math.min(1, f.dt * 8);
            vx = Math.cos(na) * sp0; vy = Math.sin(na) * sp0;
          }
          const sp = Math.hypot(vx, vy), cap = 1.25 * U;
          if (sp > cap) { vx = (vx / sp) * cap; vy = (vy / sp) * cap; }
        }
        px += vx * f.dt; py += vy * f.dt;
        g.tilt = Math.atan2(vy, vx) + Math.PI / 2;

        for (const gm of gems) {
          if (gm.got) continue;
          if (Math.hypot(px - gm.x, py - gm.y) < 40 * f.sizeF) {
            gm.got = true;
            streak++;
            reward(api, gm.x, gm.y, 15, "#7ef0e2");
          }
        }
        for (const r of rocks) {
          if (r.warn > 0) continue;
          if (Math.hypot(px - r.x, py - r.y) < r.r + 26 * f.sizeF) {
            streak = 0;
            api.burst(px, py, "#ff8a5c", 22);
            api.hurt();
            toOrbit(f, true);
            break;
          }
        }
        if (mode === "fly" && d < next!.r + 34 * f.sizeF) {
          streak++;
          reward(api, next!.x, tgt.y, 20, "#ffe066", perfect);
          if (perfect) {
            api.score(25);
            api.pop(next!.x, tgt.y - 44 * f.sizeF, "PERFECT!", "#fff3c4");
          }
          const pr = praise(streak);
          if (pr) api.pop(next!.x, tgt.y - 66 * f.sizeF, pr, "#fb66e5");
          /* scroll the world so the new home planet sits back on the left */
          const shift = next!.x - f.W * 0.28;
          cur = { ...next!, x: next!.x - shift };
          px -= shift;
          for (const r of rocks) r.x -= shift;
          spawnNext(f);
          toOrbit(f);
        } else if (mode === "fly" && (flightT > 2.2 || px < -70 * f.sizeF || px > f.W + 70 * f.sizeF
                   || py < -80 * f.sizeF || py > f.H + 80 * f.sizeF)) {
          streak = 0;
          api.pop(clamp(px, 40, f.W - 40), clamp(py, 50, f.H - 50), "MISSED!", "#ff8a5c");
          api.shake(0.3);
          toOrbit(f, true);
        }
      }
      g.heroX = px; g.heroY = py;
    },
    draw(ctx, f) {
      if (!cur || !next) return;
      const paintPlanet = (p: Planet, target: boolean) => {
        const y = pY(p, f);
        ctx.save();
        ctx.translate(p.x, y);
        if (target) {
          const pu = 1 + Math.sin(f.t * 4) * 0.05;
          ctx.strokeStyle = `rgba(255,230,150,${0.45 + Math.sin(f.t * 4) * 0.25})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([7, 9]);
          ctx.beginPath();
          ctx.arc(0, 0, (p.r + 34 * f.sizeF) * pu, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const pg = ctx.createRadialGradient(-p.r * 0.35, -p.r * 0.35, p.r * 0.1, 0, 0, p.r);
        pg.addColorStop(0, p.c1);
        pg.addColorStop(1, p.c2);
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, TAU);
        ctx.fill();
        inkStroke(ctx, 3.4);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.beginPath();
        ctx.arc(-p.r * 0.32, -p.r * 0.34, p.r * 0.22, 0, TAU);
        ctx.fill();
        ctx.restore();
      };
      /* home orbit ring */
      ctx.save();
      ctx.strokeStyle = "rgba(200,190,255,0.28)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 9]);
      ctx.beginPath();
      ctx.arc(cur.x, pY(cur, f), orbR(f), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      paintPlanet(cur, false);
      paintPlanet(next, true);
      for (const gm of gems) {
        if (gm.got) continue;
        ctx.save();
        ctx.translate(gm.x, gm.y);
        paintGem(ctx, 13 * f.sizeF, f.t, gm.seed);
        ctx.restore();
      }
      for (const r of rocks) {
        if (r.warn > 0) continue;
        ctx.save();
        ctx.translate(r.x, r.y);
        paintRock(ctx, r.r, f.t, r.seed);
        ctx.restore();
      }
    },
    drawFront(ctx, f) {
      if (!cur || !next) return;
      const R = orbR(f);
      const cx = cur.x, cyy = pY(cur, f);
      if (mode === "orbit") {
        /* the GO window, painted right on the orbit ring */
        const W0 = win(f.t);
        ctx.save();
        ctx.lineCap = "round";
        const steps = 96;
        for (let i = 0; i < steps; i++) {
          const a0 = (i / steps) * TAU, a1 = ((i + 1) / steps) * TAU;
          const e = Math.abs(aimErr(a0, f));
          if (e > W0) continue;
          const hot = e < W0 * 0.34;
          ctx.strokeStyle = hot ? "rgba(255,246,196,0.95)" : "rgba(126,240,226,0.75)";
          ctx.lineWidth = (hot ? 9 : 6) * f.sizeF;
          ctx.beginPath();
          ctx.arc(cx, cyy, R, a0, a1);
          ctx.stroke();
        }
        ctx.restore();

        /* dotted preview of the hop you'd get by tapping right now */
        const p = orbPos(ang, f);
        const inWin = Math.abs(aimErr(ang, f)) < W0;
        const tgt = { x: next.x, y: pY(next, f) };
        ctx.save();
        const pts: { x: number; y: number }[] = [];
        if (inWin) {
          for (let i = 1; i <= 14; i++) {
            pts.push({ x: lerp(p.x, tgt.x, i / 15), y: lerp(p.y, tgt.y, i / 15) });
          }
        } else {
          const dist = Math.hypot(tgt.x - p.x, tgt.y - p.y) || 1;
          const speed = dist / 1.05;
          let sx = p.x, sy = p.y;
          let svx = -Math.sin(ang) * speed, svy = Math.cos(ang) * speed;
          const U = Math.min(f.W, f.H), h = 1 / 40;
          for (let i = 0; i < 40; i++) {
            const dx = tgt.x - sx, dy = tgt.y - sy, d = Math.hypot(dx, dy) || 1;
            svx += (dx / d) * 1.05 * U * h;
            svy += (dy / d) * 1.05 * U * h;
            sx += svx * h; sy += svy * h;
            if (i % 3 === 0) pts.push({ x: sx, y: sy });
            if (sx < -40 || sx > f.W + 40 || sy < -40 || sy > f.H + 40) break;
          }
        }
        let danger = false;
        for (const pt of pts) {
          for (const r of rocks) {
            if (r.warn <= 0 && Math.hypot(pt.x - r.x, pt.y - r.y) < r.r + 26 * f.sizeF) danger = true;
          }
        }
        pts.forEach((pt, i) => {
          const u = i / Math.max(1, pts.length - 1);
          ctx.globalAlpha = (1 - u * 0.7) * (inWin ? 0.95 : 0.6);
          ctx.fillStyle = danger ? "#ff4d6d" : inWin ? "#7ef0e2" : "#ffd65a";
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, (inWin ? 4.4 : 3.4) * f.sizeF, 0, TAU);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.restore();

        if (inWin) {
          ctx.save();
          ctx.globalAlpha = 0.5 + 0.4 * Math.sin(f.t * 12);
          ctx.strokeStyle = "#7ef0e2";
          ctx.lineWidth = 4 * f.sizeF;
          ctx.beginPath();
          ctx.arc(tgt.x, tgt.y, next.r + 20 * f.sizeF, 0, TAU);
          ctx.stroke();
          ctx.font = `900 ${Math.round(12 * f.sizeF) + 7}px 'Baloo 2', sans-serif`;
          ctx.fillStyle = "#7ef0e2";
          ctx.textAlign = "center";
          ctx.fillText("TAP!", px, py - 46 * f.sizeF);
          ctx.restore();
        }
      }
      for (const r of rocks) {
        if (r.warn > 0) {
          warnChevron(ctx, f.W - 18 * f.sizeF, clamp(r.y, 30 * f.sizeF, f.floorY), f.sizeF * 1.3, f.t, Math.PI, "#ff4d6d");
        }
      }
      ctx.globalAlpha = 1;
    },
  };
  return g;
}

/* ── factory ────────────────────────────────────────────────────────────── */

export function spaceGame(id: string): GameInstance | null {
  switch (id) {
    case "starRush": return starRush();
    case "astroLanes": return astroLanes();
    case "orbitHop": return orbitHop();
    default: return null;
  }
}
