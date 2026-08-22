// ─── OCEAN mini-games: Bubble Gulp · Coral Glide · Crab Tap ─────────────────
// Every game reads its difficulty from `prog` (0→1 across the 60s round) and
// unlocks a fresh hazard at ~20s and ~40s. All motion is `f.dt` based and all
// sizes/speeds scale with `f.sizeF` (or with W/H) so phones, tablets and
// desktops — portrait *and* landscape — play the same.
import {
  clamp, clamp01, easeOut, lerp, rnd, star5,
  type Frame, type GameAPI, type GameInstance, type GameMeta,
} from "./core";

export const OCEAN_GAMES: GameMeta[] = [
    { id: "bubbleGulp", title: "Bubble Gulp", emoji: "🫧", how: "HOLD to swim up, let go to sink. Gulp the star snacks — snacks in the DEEP dark water pay DOUBLE! Dodge the wobbly jellies." },
    { id: "coralGlide", title: "Coral Glide", emoji: "🪸", how: "TAP to flap! Slip through the coral gates and snatch the pearl hiding in every gap. Three pearls in a row = big bonus." },
    { id: "crabTap", title: "Crab Tap", emoji: "🦀", how: "TAP the crabs the second they pop out of the sand. Never poke a spiky pufferfish! A GOLD crab starts a double-points FEVER." },
];

/* ── local juice helpers ───────────────────────────────────────────────── */

const prog60 = (t: number) => clamp01(t / 60);
const INK = "rgba(30,24,48,0.8)";

function inkStroke(ctx: CanvasRenderingContext2D, w: number) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = w;
  ctx.lineJoin = "round";
}

/** Score + burst + floating text in one call, so every hit feels the same. */
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

/** Flashing chevron pinned to a screen edge: "something is coming from here". */
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

/* ── entity painters — pickups are ROUND/STARRY, hazards are SPIKY/TENTACLED
      so they read without relying on colour ─────────────────────────────── */

function paintSnack(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  const pu = 1 + Math.sin(t * 6 + seed) * 0.08;
  ctx.save();
  ctx.scale(pu, 1 / pu);
  ctx.fillStyle = "rgba(255,246,205,0.5)";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.fill();
  inkStroke(ctx, 3);
  ctx.stroke();
  ctx.fillStyle = "#ffd65a";
  star5(ctx, 0, 0, r * 0.56, t * 1.7 + seed);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, Math.PI * 1.05, Math.PI * 1.45);
  ctx.stroke();
  ctx.restore();
}

function paintShell(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  ctx.rotate(Math.sin(t * 3 + seed) * 0.18);
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, "#fff4c0");
  g.addColorStop(1, "#ffab2e");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-r, r * 0.55);
  ctx.arc(0, r * 0.55, r, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  inkStroke(ctx, 3);
  ctx.stroke();
  ctx.strokeStyle = "rgba(160,90,10,0.5)";
  ctx.lineWidth = 2;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.5);
    ctx.lineTo(Math.cos(Math.PI * (0.5 + k * 0.17)) * r * 0.92, r * 0.55 - Math.abs(Math.sin(Math.PI * (0.5 + k * 0.17))) * r * 0.92);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 8 + seed);
  ctx.fillStyle = "#ffffff";
  star5(ctx, r * 0.45, -r * 0.3, r * 0.28, t * 2);
  ctx.restore();
}

function paintJelly(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  ctx.rotate(Math.sin(t * 2 + seed) * 0.14);
  const squash = 1 + Math.sin(t * 3.4 + seed) * 0.12;
  ctx.scale(squash, 1 / squash);
  ctx.strokeStyle = "rgba(255,190,245,0.85)";
  ctx.lineWidth = 3.2;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(k * r * 0.26, -r * 0.1);
    ctx.quadraticCurveTo(k * r * 0.3 + Math.sin(t * 4 + k + seed) * r * 0.18, r * 0.55, k * r * 0.24, r * 1.0);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(251,102,229,0.9)";
  ctx.beginPath();
  ctx.arc(0, -r * 0.12, r * 0.78, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  inkStroke(ctx, 3);
  ctx.stroke();
  ctx.fillStyle = "#2d2926";
  ctx.beginPath();
  ctx.arc(-r * 0.24, -r * 0.34, r * 0.1, 0, 7);
  ctx.arc(r * 0.24, -r * 0.34, r * 0.1, 0, 7);
  ctx.fill();
  ctx.restore();
}

function paintUrchin(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  ctx.rotate(t * 0.7 + seed);
  ctx.fillStyle = "#3b1f5e";
  inkStroke(ctx, 3);
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2;
    const len = r * (1.05 + Math.sin(t * 5 + k) * 0.07);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.16) * r * 0.6, Math.sin(a - 0.16) * r * 0.6);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.lineTo(Math.cos(a + 0.16) * r * 0.6, Math.sin(a + 0.16) * r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = "#5b2f8a";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffe066";
  ctx.beginPath();
  ctx.arc(-r * 0.18, -r * 0.1, r * 0.12, 0, 7);
  ctx.arc(r * 0.18, -r * 0.1, r * 0.12, 0, 7);
  ctx.fill();
  ctx.restore();
}

function paintPearl(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  const pu = 1 + Math.sin(t * 5 + seed) * 0.1;
  ctx.scale(pu, 1 / pu);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#bff6ff";
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#9fd8ff");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  inkStroke(ctx, 2.6);
  ctx.stroke();
  ctx.restore();
}

function paintCrab(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number, gold: boolean) {
  ctx.save();
  ctx.fillStyle = gold ? "#ffc32c" : "#ff6b4a";
  inkStroke(ctx, 3);
  const wave = Math.sin(t * 7 + seed) * 0.3;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * r * 0.78, -r * 0.12);
    ctx.rotate(s * (0.45 + wave));
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.34, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.4, r * 0.1 + k * r * 0.14);
      ctx.lineTo(s * (r * 0.85 + Math.sin(t * 8 + k + seed) * r * 0.08), r * 0.3 + k * r * 0.18);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.78, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.26, -r * 0.38);
    ctx.lineTo(s * r * 0.32, -r * 0.72);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(s * r * 0.32, -r * 0.8, r * 0.17, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2d2926";
    ctx.beginPath();
    ctx.arc(s * r * 0.34, -r * 0.8, r * 0.08, 0, 7);
    ctx.fill();
    ctx.fillStyle = gold ? "#ffc32c" : "#ff6b4a";
  }
  if (gold) {
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 9 + seed);
    ctx.fillStyle = "#fff6c0";
    star5(ctx, r * 0.55, -r * 0.55, r * 0.3, t * 3);
  }
  ctx.restore();
}

function paintPuffer(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  const pu = 1 + Math.sin(t * 4 + seed) * 0.07;
  ctx.scale(pu, pu);
  ctx.fillStyle = "#7de3ff";
  inkStroke(ctx, 3);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const len = r * (1.0 + Math.sin(t * 6 + k) * 0.06);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.14) * r * 0.62, Math.sin(a - 0.14) * r * 0.62);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.lineTo(Math.cos(a + 0.14) * r * 0.62, Math.sin(a + 0.14) * r * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-r * 0.22, -r * 0.12, r * 0.16, 0, 7);
  ctx.arc(r * 0.22, -r * 0.12, r * 0.16, 0, 7);
  ctx.fill();
  ctx.fillStyle = "#2d2926";
  ctx.beginPath();
  ctx.arc(-r * 0.2, -r * 0.12, r * 0.08, 0, 7);
  ctx.arc(r * 0.24, -r * 0.12, r * 0.08, 0, 7);
  ctx.fill();
  ctx.strokeStyle = "#2d2926";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, r * 0.16, r * 0.16, 0.15, Math.PI - 0.15);
  ctx.stroke();
  ctx.restore();
}

/* ══ OCEAN 1 · Bubble Gulp ═════════════════════════════════════════════════
   HOLD to rise, release to sink. NEW: the DEEP band at the bottom pays ×2 —
   but that is where the jellies like to hang out.                          */

interface Bub {
  x: number; y: number; r: number; seed: number;
  kind: 0 | 1 | 2 | 3; // 0 snack · 1 golden shell · 2 jelly · 3 urchin
  scored: boolean; drift: number;
}

function bubbleGulp(): GameInstance {
  const ents: Bub[] = [];
  let hy = 0.42, vy = 0, spawnT = 0.5, streak = 0, init = false;
  const DEEP = 0.64; // fraction of H below which snacks are worth double

  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    hint: "Hold to rise · snacks in the DEEP are worth ×2",
    update(f, inp, api) {
      const prog = prog60(f.t);
      const botY = f.floorY / f.H - 0.05;
      const topY = 0.07;
      if (!init) { hy = 0.42; init = true; }

      /* swim: acceleration in screen-heights so it feels the same everywhere */
      vy += (inp.down ? -2.9 : 1.8) * f.dt;
      vy = clamp(vy, -0.72, 0.72);
      hy += vy * f.dt;
      if (hy < topY) { hy = topY; vy = Math.max(vy, 0) * 0.2; }
      if (hy > botY) { hy = botY; vy = Math.min(vy, 0) * 0.2; }
      g.heroX = f.W * 0.24;
      g.heroY = hy * f.H;
      g.tilt = clamp(vy * 0.55, -0.45, 0.45);

      /* ── spawning ──────────────────────────────────────────────────── */
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const hazChance = f.t < 5 ? 0 : lerp(0.22, 0.46, prog);
        if (f.t > 12 && rnd() < 0.06) {
          /* rare golden shell — always in a corner of the field */
          ents.push({
            x: 1.1, y: rnd() < 0.5 ? 0.1 + rnd() * 0.08 : botY - 0.02 - rnd() * 0.06,
            r: 26, seed: rnd() * 10, kind: 1, scored: false, drift: 0,
          });
        } else if (rnd() < hazChance) {
          if (f.t > 40 && rnd() < 0.32) {
            /* jelly wall — always a corridor at least 0.4H wide to swim through */
            const gapC = 0.30 + rnd() * Math.max(0.02, botY - 0.60);
            for (const s of [-1, 1]) {
              ents.push({
                x: 1.34, y: clamp(gapC + s * 0.21, 0.09, botY), r: 26,
                seed: rnd() * 10, kind: 2, scored: false, drift: 0,
              });
            }
          } else {
            const deep = rnd() < 0.55;
            const y = deep ? lerp(DEEP + 0.02, botY, rnd()) : lerp(0.1, DEEP, rnd());
            const spiky = f.t > 20 && rnd() < 0.42;
            ents.push({
              x: 1.34, y, r: spiky ? 24 : 27, seed: rnd() * 10,
              kind: spiky ? 3 : 2, scored: false, drift: spiky ? (rnd() - 0.5) * 0.1 : 0,
            });
          }
        } else {
          /* a snack, or a little run of three to chase a combo with */
          const run = rnd() < 0.45 ? 3 : 1;
          const deep = f.t > 6 && rnd() < 0.38;
          /* the opening snacks drift in at the hero's resting height */
          const base = f.t < 6
            ? 0.42 + (rnd() - 0.5) * 0.1
            : deep ? lerp(DEEP + 0.03, botY - 0.01, rnd()) : lerp(0.11, DEEP - 0.02, rnd());
          for (let k = 0; k < run; k++) {
            ents.push({
              x: 1.08 + k * 0.08, y: clamp(base + Math.sin(k * 1.1) * 0.055, 0.09, botY),
              r: 20, seed: rnd() * 10, kind: 0, scored: false, drift: 0,
            });
          }
        }
        spawnT = lerp(0.9, 0.44, prog) * (0.78 + rnd() * 0.44);
      }
      if (ents.length > 44) ents.splice(0, ents.length - 44);

      /* ── motion + collisions ───────────────────────────────────────── */
      const sp = lerp(0.34, 0.6, prog);
      const heroR = 44 * f.sizeF;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        const bad = e.kind >= 2;
        e.x -= (sp + (bad ? 0.05 : 0)) * f.dt;
        e.y = clamp(e.y + (Math.sin(f.t * 1.9 + e.seed) * 0.05 + e.drift) * f.dt, 0.08, botY);
        if (e.x < -0.12) { ents.splice(i, 1); continue; }
        const ex = e.x * f.W, ey = e.y * f.H;
        const er = e.r * f.sizeF;
        const d = Math.hypot(ex - g.heroX, ey - g.heroY);
        if (!bad) {
          if (d < heroR * 0.95 + er) {
            ents.splice(i, 1);
            if (e.kind === 1) {
              streak++;
              reward(api, ex, ey, 50, "#ffd65a", true);
              api.pop(ex, ey - 34 * f.sizeF, "TREASURE!", "#fff3c4");
            } else {
              const deep = hy > DEEP;
              streak++;
              reward(api, ex, ey, deep ? 20 : 10, deep ? "#8ff0ff" : "#ffd65a", deep);
              if (deep) api.pop(ex, ey - 30 * f.sizeF, "DEEP!", "#8ff0ff");
              const p = praise(streak);
              if (p) api.pop(g.heroX, g.heroY - 46 * f.sizeF, p, "#fb66e5");
            }
          }
        } else if (d < heroR * 0.62 + er * 0.62) {
          ents.splice(i, 1);
          streak = 0;
          api.burst(ex, ey, "#fb66e5", 18);
          api.hurt();
        } else if (!e.scored && ex < g.heroX - er * 0.5) {
          /* squeaked past — reward the bravery, keep the combo alive */
          e.scored = true;
          if (Math.abs(ey - g.heroY) < (heroR + er) * 1.5) {
            api.score(2);
            api.pop(g.heroX, g.heroY - 40 * f.sizeF, "PHEW!", "#7ef0e2");
            api.blip();
          }
        }
      }
    },
    draw(ctx, f) {
      /* the DEEP band: risk/reward zone, painted behind everything */
      const dy = DEEP * f.H;
      ctx.save();
      const gr = ctx.createLinearGradient(0, dy, 0, f.floorY);
      gr.addColorStop(0, "rgba(4,16,60,0)");
      gr.addColorStop(1, "rgba(4,14,52,0.5)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, dy, f.W, f.floorY - dy + 4);
      ctx.strokeStyle = `rgba(140,240,255,${0.25 + 0.15 * Math.sin(f.t * 2)})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([12 * f.sizeF, 10 * f.sizeF]);
      ctx.beginPath();
      ctx.moveTo(0, dy);
      ctx.lineTo(f.W, dy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(f.t * 2);
      ctx.font = `900 ${Math.round(11 * f.sizeF) + 7}px 'Baloo 2', sans-serif`;
      ctx.fillStyle = "#8ff0ff";
      ctx.textAlign = "left";
      ctx.fillText("DEEP ×2", 10 * f.sizeF, dy + 20 * f.sizeF);
      ctx.restore();

      for (const e of ents) {
        if (e.x > 1.05) continue;
        ctx.save();
        ctx.translate(e.x * f.W, e.y * f.H);
        const r = e.r * f.sizeF;
        if (e.kind === 0) paintSnack(ctx, r, f.t, e.seed);
        else if (e.kind === 1) paintShell(ctx, r, f.t, e.seed);
        else if (e.kind === 2) paintJelly(ctx, r, f.t, e.seed);
        else paintUrchin(ctx, r, f.t, e.seed);
        ctx.restore();
      }
    },
    drawFront(ctx, f) {
      for (const e of ents) {
        if (e.x <= 1.02) continue;
        const bad = e.kind >= 2;
        warnChevron(
          ctx, f.W - 16 * f.sizeF, clamp(e.y * f.H, 30 * f.sizeF, f.floorY),
          f.sizeF, f.t, Math.PI, bad ? "#ff4d6d" : "#ffd65a",
        );
      }
      ctx.globalAlpha = 1;
    },
  };
  return g;
}

/* ══ OCEAN 2 · Coral Glide ═════════════════════════════════════════════════
   Flap through coral gates. NEW: every gap hides a pearl, always off-centre —
   safe line or greedy line? Three pearls in a row = chain bonus.           */

interface Gate {
  x: number; gapY: number; gapH: number; seed: number;
  passed: boolean; pearlY: number; pearlGot: boolean; pearlDone: boolean;
}

function coralGlide(): GameInstance {
  const gates: Gate[] = [];
  let hy = 0.4, vy = 0, spawnT = 0.9, pending = false, chain = 0, streak = 0;
  let lastGapY = 0.45, init = false, bonk = 0;

  const driftAmp = (t: number) => lerp(0, 0.05, clamp01((t - 20) / 34));
  const gapCenter = (gt: Gate, f: Frame) => {
    const marg = gt.gapH / 2 + 0.05 * f.H;
    return clamp(
      gt.gapY + Math.sin(f.t * 1.05 + gt.seed) * driftAmp(f.t) * f.H,
      marg, Math.max(marg, f.floorY - marg),
    );
  };

  const spawnGate = (f: Frame, x: number, near?: number) => {
    const gapH = Math.max(lerp(0.42, 0.27, prog60(f.t)) * f.H, 200 * f.sizeF);
    const marg = gapH / 2 + 0.05 * f.H;
    const lo = marg, hi = Math.max(marg, f.floorY - marg);
    const want = near !== undefined
      ? near + (rnd() < 0.5 ? -1 : 1) * 0.09 * f.H
      : lastGapY * f.H + (rnd() * 2 - 1) * 0.22 * f.H;
    const gapY = clamp(want, lo, hi);
    lastGapY = gapY / f.H;
    gates.push({
      x, gapY, gapH, seed: rnd() * 10, passed: false,
      pearlY: (rnd() < 0.5 ? -1 : 1) * gapH * 0.3,
      pearlGot: false, pearlDone: false,
    });
    return gapY;
  };

  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    hint: "Tap to flap · grab 3 pearls in a row!",
    onDown() { pending = true; }, // buffered: a tap is never eaten between frames
    update(f, _inp, api) {
      const prog = prog60(f.t);
      if (!init) { hy = 0.4; lastGapY = 0.45; init = true; }
      const botY = (f.floorY - 26 * f.sizeF) / f.H;

      if (pending) {
        pending = false;
        vy = -1.02;
        api.burst(g.heroX - 16 * f.sizeF, g.heroY + 20 * f.sizeF, "rgba(200,245,255,0.9)", 5);
      }
      vy += 2.95 * f.dt;
      vy = clamp(vy, -1.2, 1.5);
      hy += vy * f.dt;
      if (hy < 0.06) { hy = 0.06; vy = 0; }
      if (hy > botY) { hy = botY; vy = 0; if (bonk <= 0) bonk = 0.3; }
      bonk = Math.max(0, bonk - f.dt);
      g.heroX = f.W * 0.3;
      g.heroY = hy * f.H;
      g.tilt = clamp(vy * 0.42, -0.5, 0.6);

      /* ── gates ─────────────────────────────────────────────────────── */
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const gy = spawnGate(f, f.W + 80 * f.sizeF);
        if (f.t > 40 && rnd() < 0.45) spawnGate(f, f.W + 80 * f.sizeF + f.W * 0.38, gy);
        spawnT = lerp(2.0, 1.2, prog);
      }
      if (gates.length > 10) gates.splice(0, gates.length - 10);

      const sp = lerp(0.3, 0.52, prog) * f.W;
      const colW = 46 * f.sizeF;
      const heroR = 44 * f.sizeF;
      for (let i = gates.length - 1; i >= 0; i--) {
        const gt = gates[i];
        gt.x -= sp * f.dt;
        if (gt.x < -colW * 2) { gates.splice(i, 1); continue; }
        const cy = gapCenter(gt, f);

        /* pearl — generous grab box, sits off-centre in the gap */
        const py = cy + gt.pearlY;
        if (!gt.pearlGot && Math.abs(gt.x - g.heroX) < heroR + 26 * f.sizeF
            && Math.abs(g.heroY - py) < heroR * 0.9 + 24 * f.sizeF) {
          gt.pearlGot = true; gt.pearlDone = true;
          chain++; streak++;
          reward(api, gt.x, py, 15, "#bff6ff");
          if (chain % 3 === 0) {
            api.score(40);
            api.burst(g.heroX, g.heroY, "#bff6ff", 30);
            api.pop(g.heroX, g.heroY - 52 * f.sizeF, "PEARL CHAIN!", "#7ef0e2");
            api.shake(0.5);
          }
        } else if (!gt.pearlDone && gt.x < g.heroX - colW) {
          gt.pearlDone = true;
          chain = 0;
        }

        /* the coral itself — forgiving hitbox, corner-cut friendly */
        if (Math.abs(gt.x - g.heroX) < colW / 2 + heroR * 0.5) {
          const dy = Math.abs(g.heroY - cy);
          if (dy > gt.gapH / 2 - heroR * 0.42) {
            if (!api.inv()) {
              streak = 0; chain = 0;
              api.burst(g.heroX, g.heroY, "#fb66e5", 20);
              api.hurt();
              /* nudge back toward the middle so you never grind the wall */
              hy = cy / f.H;
              vy = -0.35;
            }
          }
        }
        if (!gt.passed && gt.x + colW / 2 < g.heroX) {
          gt.passed = true;
          streak++;
          reward(api, g.heroX + 30 * f.sizeF, cy, 10, "#ffd65a");
          const p = praise(streak);
          if (p) api.pop(g.heroX, g.heroY - 50 * f.sizeF, p, "#fb66e5");
        }
      }
    },
    draw(ctx, f) {
      const colW = 46 * f.sizeF;
      for (const gt of gates) {
        if (gt.x < -colW * 2 || gt.x > f.W + colW * 2) continue;
        const cy = gapCenter(gt, f);
        for (const [y0, y1] of [[-12, cy - gt.gapH / 2], [cy + gt.gapH / 2, f.H + 12]] as const) {
          const h = y1 - y0;
          if (h <= 0) continue;
          ctx.save();
          ctx.translate(gt.x, y0);
          const grad = ctx.createLinearGradient(-colW / 2, 0, colW / 2, 0);
          grad.addColorStop(0, "#ff8fb2");
          grad.addColorStop(0.5, "#fb66e5");
          grad.addColorStop(1, "#a63f9c");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(-colW / 2, 0, colW, h, 14);
          ctx.fill();
          inkStroke(ctx, 3.4);
          ctx.stroke();
          ctx.fillStyle = "#ffc2dd";
          for (let b = 0; b < Math.floor(h / (46 * f.sizeF)); b++) {
            const side = b % 2 ? 1 : -1;
            ctx.beginPath();
            ctx.arc(side * colW * 0.5, 22 * f.sizeF + b * 46 * f.sizeF, 8 * f.sizeF, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          /* glowing lip on the gap side */
          const lipY = y1 === f.H + 12 ? 0 : h;
          ctx.fillStyle = "#fff3c4";
          ctx.beginPath();
          ctx.ellipse(0, lipY, colW * 0.56, 10 * f.sizeF, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        if (!gt.pearlGot) {
          ctx.save();
          ctx.translate(gt.x, cy + gt.pearlY);
          paintPearl(ctx, 13 * f.sizeF, f.t, gt.seed);
          ctx.restore();
        }
      }
    },
    drawFront(ctx, f) {
      /* where is the next gap? a chevron on the right edge points at it */
      let next: Gate | null = null;
      for (const gt of gates) {
        if (gt.x > f.W * 0.95 && (!next || gt.x < next.x)) next = gt;
      }
      if (next) {
        warnChevron(ctx, f.W - 16 * f.sizeF, gapCenter(next, f), f.sizeF, f.t, Math.PI, "#7ef0e2");
      }
      if (bonk > 0) {
        ctx.save();
        ctx.globalAlpha = bonk / 0.3;
        ctx.strokeStyle = "#fff3c4";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(g.heroX, g.heroY, (34 + (0.3 - bonk) * 90) * f.sizeF, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  };
  return g;
}

/* ══ OCEAN 3 · Crab Tap ════════════════════════════════════════════════════
   A private, redesigned pop-up engine: a responsive grid of burrows (up to
   15) instead of five fixed holes, a telegraph bulge before each pop, and a
   GOLD crab that starts a 4-second double-points FEVER.                    */

interface Pop {
  hole: number; kind: 0 | 1 | 2; // 0 crab · 1 puffer · 2 gold crab
  born: number; life: number; tell: number; dead: number; seed: number;
}

function gridOf(f: Frame) {
  const cols = clamp(Math.round(f.W / (132 * f.sizeF)), 3, 5);
  const rows = clamp(Math.round((f.floorY - 0.4 * f.H) / (120 * f.sizeF)), 2, 3);
  return { cols, rows, n: cols * rows };
}

function holePos(f: Frame, i: number) {
  const { cols, rows } = gridOf(f);
  const idx = ((i % (cols * rows)) + cols * rows) % (cols * rows);
  const c = idx % cols, r = Math.floor(idx / cols);
  const x0 = f.W * 0.14, x1 = f.W * 0.86;
  const y0 = f.H * 0.4, y1 = f.floorY - 24 * f.sizeF;
  const x = cols > 1 ? lerp(x0, x1, c / (cols - 1)) : (x0 + x1) / 2;
  const y = rows > 1 ? lerp(y0, y1, r / (rows - 1)) : (y0 + y1) / 2;
  return { x: x + (r % 2 ? 1 : -1) * f.W * 0.018, y };
}

function riseOf(p: Pop, t: number) {
  const age = t - p.born;
  if (age < p.tell) return 0;
  if (p.dead >= 0) return clamp01(1 - (t - p.dead) / 0.16);
  const u = age - p.tell;
  if (u < 0.15) return easeOut(u / 0.15);
  const left = p.life - u;
  if (left < 0.18) return clamp01(left / 0.18);
  return 1;
}

function crabTap(): GameInstance {
  const pops: Pop[] = [];
  const puffs: { x: number; y: number; t0: number }[] = [];
  let spawnT = 0.5, fever = 0, streak = 0, lookX = 0.5, bounce = 0;
  let apiRef: GameAPI | null = null;

  /** Resolve a tap that landed on a pop-up. */
  const tapResult = (p: Pop, x: number, y: number, f: Frame) => {
    const api = apiRef;
    if (!api) return;
    if (p.kind === 1) {
      streak = 0;
      api.burst(x, y, "#7de3ff", 20);
      api.pop(x, y - 26 * f.sizeF, "OUCH!", "#ff4d6d");
      api.hurt();
      return;
    }
    streak++;
    if (p.kind === 2) {
      fever = 4;
      reward(api, x, y, 40, "#ffc32c", true);
      api.pop(x, y - 36 * f.sizeF, "FEVER!", "#fff3c4");
    } else {
      reward(api, x, y, fever > 0 ? 20 : 10, fever > 0 ? "#ffc32c" : "#ff6b4a", fever > 0);
    }
    const pr = praise(streak);
    if (pr) api.pop(x, y - 48 * f.sizeF, pr, "#fb66e5");
  };

  const spawnOne = (f: Frame, forceCrab: boolean) => {
    const { n } = gridOf(f);
    const busy = new Set(pops.filter((p) => p.dead < 0).map((p) => p.hole));
    const free: number[] = [];
    for (let i = 0; i < n; i++) if (!busy.has(i)) free.push(i);
    if (!free.length) return;
    const prog = prog60(f.t);
    const pufferChance = f.t < 5 ? 0 : lerp(0.14, 0.34, prog) * (fever > 0 ? 0.4 : 1);
    let kind: 0 | 1 | 2 = 0;
    if (!forceCrab && rnd() < pufferChance) kind = 1;
    else if (f.t > 18 && fever <= 0 && rnd() < 0.07) kind = 2;
    pops.push({
      hole: free[(rnd() * free.length) | 0],
      kind,
      born: f.t,
      life: (kind === 2 ? 1.1 : lerp(1.8, 1.0, prog)) * (fever > 0 ? 0.85 : 1),
      tell: kind === 1 ? 0.3 : 0.24,
      dead: -1,
      seed: rnd() * 10,
    });
  };

  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 0.9,
    hint: "Tap the crabs · never poke a spiky puffer!",
    onDown(f, inp) {
      const px = inp.x * f.W, py = inp.y * f.H;
      const R = 48 * f.sizeF;
      let best = -1, bestD = R;
      for (let i = 0; i < pops.length; i++) {
        const p = pops[i];
        if (p.dead >= 0) continue;
        const rise = riseOf(p, f.t);
        if (rise < 0.25) continue;
        /* a puffer that only just surfaced can never be mis-tapped */
        if (p.kind === 1 && f.t - p.born < p.tell + 0.22) continue;
        const h = holePos(f, p.hole);
        const d = Math.hypot(px - h.x, py - (h.y - rise * 30 * f.sizeF));
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) { puffs.push({ x: px, y: py, t0: f.t }); return; }
      const p = pops[best];
      const h = holePos(f, p.hole);
      const hy = h.y - 30 * f.sizeF;
      lookX = h.x / f.W;
      bounce = 0.25;
      p.dead = f.t;
      tapResult(p, h.x, hy, f);
    },
    update(f, _inp, api) {
      apiRef = api;
      const prog = prog60(f.t);
      fever = Math.max(0, fever - f.dt);
      bounce = Math.max(0, bounce - f.dt);

      /* the hero patrols the top, out of the burrow field, and leans at the
         last crab it whacked */
      g.heroX = f.W * (0.5 + Math.sin(f.t * 0.55) * 0.2);
      g.heroY = clamp(f.H * 0.2, 60 * f.sizeF, f.H * 0.3);
      g.tilt = clamp((lookX - g.heroX / f.W) * 1.1, -0.4, 0.4) + Math.sin(f.t * 3) * 0.04;
      g.heroScale = 0.9 + easeOut(bounce / 0.25) * 0.12;

      const maxLive = 2 + Math.floor(prog * 2.6);
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const live = pops.filter((p) => p.dead < 0).length;
        if (live < maxLive) {
          spawnOne(f, f.t < 5);
          if (f.t > 40 && live + 1 < maxLive && rnd() < 0.35) spawnOne(f, false);
        }
        spawnT = lerp(0.9, 0.36, prog) * (fever > 0 ? 0.55 : 1) * (0.8 + rnd() * 0.4);
      }

      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        if (p.dead >= 0) { if (f.t - p.dead > 0.2) pops.splice(i, 1); continue; }
        if (f.t - p.born > p.tell + p.life) pops.splice(i, 1);
      }
      if (pops.length > 16) pops.splice(0, pops.length - 16);
      for (let i = puffs.length - 1; i >= 0; i--) if (f.t - puffs[i].t0 > 0.35) puffs.splice(i, 1);
      if (puffs.length > 8) puffs.splice(0, puffs.length - 8);
    },
    draw(ctx, f) {
      const { n } = gridOf(f);
      const R = 30 * f.sizeF;
      /* burrows */
      for (let i = 0; i < n; i++) {
        const h = holePos(f, i);
        const live = pops.find((p) => p.hole === i && p.dead < 0);
        const tell = live ? clamp01((f.t - live.born) / live.tell) : 0;
        const bulge = live && f.t - live.born < live.tell ? Math.sin(tell * Math.PI) : 0;
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.fillStyle = "rgba(240,214,160,0.85)";
        ctx.beginPath();
        ctx.ellipse(0, 4 * f.sizeF, R * 1.15, R * 0.46, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(60,40,20,0.55)";
        ctx.beginPath();
        ctx.ellipse(0, 0, R * (0.86 + bulge * 0.12), R * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        if (bulge > 0.02) {
          ctx.fillStyle = `rgba(255,255,255,${0.4 * bulge})`;
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.arc(
              (k - 1) * 9 * f.sizeF,
              -bulge * (10 + k * 5) * f.sizeF,
              (2.2 + k * 0.7) * f.sizeF, 0, Math.PI * 2,
            );
            ctx.fill();
          }
        }
        ctx.restore();
      }
      /* pop-ups, clipped so they climb out of the sand */
      for (const p of pops) {
        const rise = riseOf(p, f.t);
        if (rise <= 0.001) continue;
        const h = holePos(f, p.hole);
        ctx.save();
        ctx.beginPath();
        ctx.rect(h.x - 46 * f.sizeF, -9999, 92 * f.sizeF, h.y + 9999 + 2 * f.sizeF);
        ctx.clip();
        ctx.translate(h.x, h.y - rise * 30 * f.sizeF);
        const sx = 1 + (1 - rise) * 0.22;
        ctx.scale(sx, 0.6 + rise * 0.4 + (1 - sx) * 0.2);
        if (p.kind === 1) paintPuffer(ctx, 27 * f.sizeF, f.t, p.seed);
        else paintCrab(ctx, 29 * f.sizeF, f.t, p.seed, p.kind === 2);
        ctx.restore();
      }
      /* sand puffs where a tap missed */
      for (const s of puffs) {
        const u = clamp01((f.t - s.t0) / 0.35);
        ctx.save();
        ctx.globalAlpha = (1 - u) * 0.6;
        ctx.strokeStyle = "#fff3c4";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, (10 + u * 26) * f.sizeF, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
    drawFront(ctx, f) {
      if (fever > 0) {
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(f.t * 12);
        ctx.strokeStyle = "#ffc32c";
        ctx.lineWidth = 10 * f.sizeF;
        ctx.strokeRect(0, 0, f.W, f.H);
        ctx.globalAlpha = 0.85;
        ctx.font = `900 ${Math.round(15 * f.sizeF) + 8}px 'Baloo 2', sans-serif`;
        ctx.fillStyle = "#ffe066";
        ctx.textAlign = "center";
        ctx.fillText(`FEVER ×2  ${fever.toFixed(1)}s`, f.W / 2, f.H * 0.34);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  };
  return g;
}

/* ── factory ────────────────────────────────────────────────────────────── */

export function oceanGame(id: string): GameInstance | null {
  switch (id) {
    case "bubbleGulp": return bubbleGulp();
    case "coralGlide": return coralGlide();
    case "crabTap": return crabTap();
    default: return null;
  }
}
