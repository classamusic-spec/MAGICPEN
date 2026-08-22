// ─── Mini-game core: shared types, math helpers & the pop-up (whack) engine ─
// Stable contract shared by every world. World modules own their own games.

export interface GameMeta { id: string; title: string; emoji: string; how: string }

export interface Frame {
  W: number; H: number; t: number; dt: number; sizeF: number; floorY: number;
}
export interface Input { down: boolean; x: number; y: number } // x,y normalized 0..1

/**
 * Everything a game can ask the shell to do. `score`/`hurt` drive the run;
 * `burst`/`pop`/`shake` are the juice layer — the shell owns the particles so
 * they always render above every entity and survive a game switch.
 */
export interface GameAPI {
  /** Award points. The shell applies the live combo multiplier. */
  score(n: number): void;
  hurt(): void;
  inv(): boolean;
  blip(): void;
  /** Confetti/spark burst at canvas px. */
  burst(x: number, y: number, color?: string, count?: number): void;
  /** Floating text ("+10", "PERFECT!") at canvas px. */
  pop(x: number, y: number, text: string, color?: string): void;
  /** Screen shake, 0..1. 0.25 = tap, 0.6 = big hit. */
  shake(amount: number): void;
  /** Live combo multiplier (1..n) — decays when you stop scoring. */
  combo(): number;
}

export interface GameInstance {
  heroX: number; heroY: number; tilt: number; heroScale: number;
  onDown?(f: Frame, inp: Input): void;
  onUp?(f: Frame): void;
  update(f: Frame, inp: Input, api: GameAPI): void;
  /** Entities painted *behind* the hero. */
  draw(ctx: CanvasRenderingContext2D, f: Frame): void;
  /** Optional overlay painted *in front of* the hero (aim lines, charge bars). */
  drawFront?(ctx: CanvasRenderingContext2D, f: Frame): void;
  /** Optional one-line coaching hint shown in the HUD for the first seconds. */
  hint?: string;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const rnd = Math.random;
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOut = (u: number) => 1 - Math.pow(1 - clamp01(u), 3);
/** Frame-rate independent smoothing factor. */
export const damp = (dt: number, rate: number) => 1 - Math.exp(-rate * dt);

/* ── shared entity painters ────────────────────────────────────────────── */

export function star5(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Generic falling/floating entity used by most catch-and-dodge games. */
export interface Ent { x: number; y: number; r: number; good: boolean; seed: number; vy: number }

/* ── shared pop-up (whack) engine — Crab Tap / Mole Mash ───────────────── */

export type PopPainter = (ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) => void;

export function whack(goodPaint: PopPainter, badPaint: PopPainter, holeCol: string): GameInstance {
  const N = 5;
  const pops: { hole: number; good: boolean; born: number; life: number }[] = [];
  let spawnT = 0.7, t0 = -1;
  let apiRef: GameAPI | null = null;
  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 0.9,
    onDown(f, inp) {
      const px = inp.x * f.W, py = inp.y * f.H;
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        const age = f.t - p.born;
        if (age < 0.12) continue;
        const hx = (0.14 + p.hole * 0.18) * f.W;
        const hyy = f.floorY + 16 - popRise(age) * 34 * f.sizeF;
        if (Math.hypot(px - hx, py - hyy) < 42 * f.sizeF) {
          pops.splice(i, 1);
          if (p.good) apiRef?.score(10); else apiRef?.hurt();
          return;
        }
      }
    },
    update(f, _inp, api) {
      apiRef = api;
      if (t0 < 0) t0 = f.t;
      g.heroX = f.W * 0.085; g.heroY = f.floorY + 6;
      g.tilt = Math.sin(f.t * 2) * 0.06;
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const busy = new Set(pops.map((p) => p.hole));
        const free = [...Array(N).keys()].filter((h) => !busy.has(h));
        if (free.length) {
          pops.push({ hole: free[Math.floor(rnd() * free.length)], good: rnd() > 0.24, born: f.t, life: 1.5 });
        }
        spawnT = Math.max(0.5, 0.95 - f.t / 200);
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        if (f.t - pops[i].born > pops[i].life) pops.splice(i, 1);
      }
    },
    draw(ctx, f) {
      /* holes */
      for (let h = 0; h < N; h++) {
        const hx = (0.14 + h * 0.18) * f.W;
        ctx.fillStyle = holeCol;
        ctx.beginPath();
        ctx.ellipse(hx, f.floorY + 18, 30 * f.sizeF, 9 * f.sizeF, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      /* pop-ups */
      for (const p of pops) {
        const age = f.t - p.born;
        const rise = popRise(age);
        if (rise <= 0) continue;
        const hx = (0.14 + p.hole * 0.18) * f.W;
        const hyy = f.floorY + 16 - rise * 34 * f.sizeF;
        ctx.save();
        ctx.beginPath(); // clip so they emerge from the hole
        ctx.rect(hx - 40 * f.sizeF, -9999, 80 * f.sizeF, f.floorY + 16 + 9999 - 6 * f.sizeF);
        ctx.clip();
        ctx.translate(hx, hyy);
        ctx.scale(1, 0.4 + rise * 0.6);
        if (p.good) goodPaint(ctx, 30 * f.sizeF, f.t, p.born);
        else badPaint(ctx, 30 * f.sizeF, f.t, p.born);
        ctx.restore();
      }
    },
  };
  return g;
}
export function popRise(age: number) {
  const u = Math.min(1, age / 0.22);
  return 1 - (1 - u) * (1 - u); // ease-out
}
