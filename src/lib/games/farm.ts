// ─── FARM mini-games: Egg Catch · Mole Mash · Pumpkin Punt ──────────────────
// House rules for every game in here:
//   • forgiving hitboxes — goodies use a *generous* grab box, hazards a *tight*
//     one, because five-year-olds are not precise;
//   • a three-step difficulty ramp (0-20s calm · 20-40s busier · 40-60s wild);
//   • exactly one decision-making mechanic per game;
//   • burst + pop on every score, shake on the big ones, a telegraph before
//     anything can hurt you.
import {
  clamp, clamp01, damp, easeOut, lerp, rnd, star5,
  type Frame, type GameAPI, type GameInstance, type GameMeta,
} from "./core";

export const FARM_GAMES: GameMeta[] = [
  {
    id: "eggCatch",
    title: "Egg Catch",
    emoji: "🥚",
    how: "SLIDE to catch falling eggs. Dodge the muddy pies! A GOLDEN egg starts an egg storm — catch a long streak for big bonuses.",
  },
  {
    id: "moleMash",
    title: "Mole Mash",
    emoji: "🐹",
    how: "Your creature is the hammer — DRAG it around and TAP the moles. Bucket-head moles need two bonks and pay double. Never bonk a bunny!",
  },
  {
    id: "pumpkinPunt",
    title: "Pumpkin Punt",
    emoji: "🎃",
    how: "SLIDE to bounce the pumpkin and smash every star. Hit with your middle for a PERFECT punt — pop the golden corn for THREE pumpkins!",
  },
];

/* ── little shared helpers ─────────────────────────────────────────────── */

const TAU = Math.PI * 2;
const INK = "#2b2622";
/** 0 before `a`, easing to 1 at `b`. The backbone of every difficulty curve. */
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

function inkStroke(ctx: CanvasRenderingContext2D, w: number, col = INK) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1.2, w);
  ctx.stroke();
}

/** Soft dark ellipse — landing shadows, hole mouths. */
function softShade(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a: number, col = "0,0,0") {
  ctx.save();
  ctx.globalAlpha = clamp01(a);
  ctx.fillStyle = `rgb(${col})`;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Bouncing chevron that telegraphs something arriving from off-screen. */
function chevron(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, pulse: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(pulse * 9) * 3 * s);
  ctx.globalAlpha = 0.65 + 0.35 * Math.sin(pulse * 9);
  ctx.beginPath();
  ctx.moveTo(-9 * s, -7 * s);
  ctx.lineTo(0, 6 * s);
  ctx.lineTo(9 * s, -7 * s);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  inkStroke(ctx, 2.4 * s);
  ctx.restore();
}

/* ── entity painters ───────────────────────────────────────────────────── */

/** Tall smooth oval + speckles. Golden version glows and wears a star. */
function paintEgg(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number, gold: boolean) {
  ctx.rotate(Math.sin(t * 3 + seed) * 0.18);
  if (gold) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 6 + seed);
    ctx.fillStyle = "#ffe066";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.5, r * 1.7, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.66, r * 0.86, 0, 0, TAU);
  if (gold) {
    const gd = ctx.createLinearGradient(-r * 0.6, -r * 0.8, r * 0.6, r * 0.8);
    gd.addColorStop(0, "#fff3b0");
    gd.addColorStop(0.5, "#ffd233");
    gd.addColorStop(1, "#f0a018");
    ctx.fillStyle = gd;
  } else {
    ctx.fillStyle = "#fffaf0";
  }
  ctx.fill();
  inkStroke(ctx, r * 0.17);
  /* highlight */
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(-r * 0.24, -r * 0.34, r * 0.15, r * 0.24, -0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
  if (gold) {
    ctx.fillStyle = "#fff6cf";
    star5(ctx, 0, r * 0.08, r * 0.34, t * 2 + seed);
  } else {
    ctx.fillStyle = "#e8b877";
    ctx.beginPath();
    ctx.arc(-r * 0.16, r * 0.06, r * 0.12, 0, TAU);
    ctx.arc(r * 0.2, r * 0.3, r * 0.09, 0, TAU);
    ctx.arc(r * 0.12, -r * 0.28, r * 0.07, 0, TAU);
    ctx.fill();
  }
}

/** Squat lumpy blob with drips — the silhouette is the opposite of an egg. */
function paintMud(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.rotate(Math.sin(t * 2 + seed) * 0.1);
  ctx.beginPath();
  ctx.moveTo(-r, r * 0.2);
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    const bump = 1 + Math.sin(i * 2.1 + seed) * 0.13;
    ctx.lineTo(Math.cos(a) * r * bump, r * 0.2 + Math.sin(a) * r * 0.62 * bump);
  }
  ctx.closePath();
  ctx.fillStyle = "#6b3f1c";
  ctx.fill();
  inkStroke(ctx, r * 0.16, "#3a2210");
  /* drips + lumps so it reads as GOOP, not a rock */
  ctx.fillStyle = "#8f5a2c";
  ctx.beginPath();
  ctx.arc(-r * 0.28, r * 0.02, r * 0.2, 0, TAU);
  ctx.arc(r * 0.3, r * 0.14, r * 0.15, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#4b2a11";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(i * r * 0.44, r * 0.7 + Math.sin(t * 5 + i + seed) * r * 0.08, r * 0.12, r * 0.2, 0, 0, TAU);
    ctx.fill();
  }
}

/** Round body, big snout, two paws up. */
function paintMole(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number, helmet: boolean) {
  const wave = Math.sin(t * 7 + seed) * 0.18;
  /* paws */
  ctx.fillStyle = "#d9ae87";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * r * 0.62, -r * 0.1 + wave * r * 0.18 * s, r * 0.19, 0, TAU);
    ctx.fill();
    inkStroke(ctx, r * 0.1);
  }
  /* body */
  ctx.beginPath();
  ctx.ellipse(0, r * 0.08, r * 0.62, r * 0.66, 0, 0, TAU);
  ctx.fillStyle = "#8a5a3b";
  ctx.fill();
  inkStroke(ctx, r * 0.13);
  /* belly */
  ctx.fillStyle = "#d9ae87";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.34, r * 0.34, r * 0.26, 0, 0, TAU);
  ctx.fill();
  /* snout */
  ctx.fillStyle = "#ffb3c2";
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.02, r * 0.19, r * 0.15, 0, 0, TAU);
  ctx.fill();
  inkStroke(ctx, r * 0.08);
  /* happy eyes */
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(-r * 0.24, -r * 0.26, r * 0.075, 0, TAU);
  ctx.arc(r * 0.24, -r * 0.26, r * 0.075, 0, TAU);
  ctx.fill();
  if (helmet) {
    /* upturned bucket — obviously different silhouette, obviously metal */
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.34);
    ctx.lineTo(-r * 0.44, -r * 0.86);
    ctx.lineTo(r * 0.44, -r * 0.86);
    ctx.lineTo(r * 0.6, -r * 0.34);
    ctx.closePath();
    const gd = ctx.createLinearGradient(-r * 0.6, 0, r * 0.6, 0);
    gd.addColorStop(0, "#8d9aa8");
    gd.addColorStop(0.4, "#e4edf5");
    gd.addColorStop(1, "#7a8794");
    ctx.fillStyle = gd;
    ctx.fill();
    inkStroke(ctx, r * 0.13);
    ctx.beginPath();
    ctx.moveTo(-r * 0.66, -r * 0.34);
    ctx.lineTo(r * 0.66, -r * 0.34);
    inkStroke(ctx, r * 0.14, "#6c7885");
  }
}

/** Tall ears, sitting still — reads as "do not hit" at a glance. */
function paintBunny(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  const wiggle = Math.sin(t * 5 + seed) * 0.14;
  ctx.fillStyle = "#f7f2e8";
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * r * 0.24, -r * 0.5);
    ctx.rotate(s * (0.16 + wiggle));
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.46, r * 0.16, r * 0.5, 0, 0, TAU);
    ctx.fill();
    inkStroke(ctx, r * 0.12);
    ctx.fillStyle = "#ffb3c2";
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.46, r * 0.07, r * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#f7f2e8";
    ctx.restore();
  }
  ctx.beginPath();
  ctx.ellipse(0, r * 0.06, r * 0.54, r * 0.58, 0, 0, TAU);
  ctx.fill();
  inkStroke(ctx, r * 0.13);
  ctx.fillStyle = INK;
  const blink = Math.sin(t * 1.7 + seed) > 0.94;
  if (blink) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.08); ctx.lineTo(-r * 0.1, -r * 0.08);
    ctx.moveTo(r * 0.1, -r * 0.08); ctx.lineTo(r * 0.3, -r * 0.08);
    inkStroke(ctx, r * 0.09);
  } else {
    ctx.beginPath();
    ctx.arc(-r * 0.2, -r * 0.08, r * 0.08, 0, TAU);
    ctx.arc(r * 0.2, -r * 0.08, r * 0.08, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "#ffb3c2";
  ctx.beginPath();
  ctx.arc(0, r * 0.1, r * 0.1, 0, TAU);
  ctx.fill();
}

/** Glowing star target smashed by the pumpkin. */
function paintStarTarget(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  ctx.globalAlpha = 0.3 + 0.25 * Math.sin(t * 5 + seed);
  ctx.fillStyle = "#fff3c4";
  star5(ctx, 0, 0, r * 1.4, t * 0.7 + seed);
  ctx.restore();
  ctx.beginPath();
  ctx.fillStyle = "#ffd233";
  star5(ctx, 0, 0, r * 0.95, t * 0.7 + seed);
  ctx.save();
  ctx.rotate(t * 0.7 + seed);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r * 0.95 : r * 0.43;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  inkStroke(ctx, r * 0.2);
  ctx.restore();
}

/** Golden corn cob — the multiball target. Cylinder, not a star. */
function paintCorn(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  ctx.rotate(Math.sin(t * 2 + seed) * 0.2);
  ctx.save();
  ctx.globalAlpha = 0.28 + 0.22 * Math.sin(t * 7 + seed);
  ctx.fillStyle = "#fff0a0";
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.2, r * 1.6, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  /* husk leaves */
  ctx.fillStyle = "#4fae3a";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.2, r * 0.4);
    ctx.quadraticCurveTo(s * r * 1.15, r * 0.3, s * r * 0.5, r * 1.25);
    ctx.quadraticCurveTo(s * r * 0.25, r * 0.8, s * r * 0.2, r * 0.4);
    ctx.closePath();
    ctx.fill();
    inkStroke(ctx, r * 0.13);
  }
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.1, r * 0.46, r * 0.92, 0, 0, TAU);
  ctx.fillStyle = "#ffcf3d";
  ctx.fill();
  inkStroke(ctx, r * 0.17);
  ctx.fillStyle = "#e8a51c";
  for (let iy = -2; iy <= 2; iy++) {
    for (let ix = -1; ix <= 1; ix++) {
      ctx.beginPath();
      ctx.arc(ix * r * 0.24, -r * 0.1 + iy * r * 0.28, r * 0.075, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ══ FARM 1 · Egg Catch ══════════════════════════════════════════════════
   Verb: CATCH. Dense goodies, sparse hazards, a streak you don't want to
   drop. Mechanic: a GOLDEN EGG starts a 5s Golden Rush — no mud, triple
   points, eggs pouring down. Chasing the gold is the decision.            */

interface Drop { x: number; y: number; vx: number; vy: number; r: number; kind: 0 | 1 | 2; seed: number }
interface Splat { x: number; t0: number; good: boolean }
const MAX_DROPS = 26;

function eggCatch(): GameInstance {
  let hx = 0.5;
  let spawnT = 0.55;
  let streak = 0;
  let nextMile = 5;
  let rushT = 0;
  const windPh = rnd() * 10;
  const drops: Drop[] = [];
  const splats: Splat[] = [];

  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    hint: "Slide under the eggs — a golden egg starts an EGG STORM!",

    update(f, inp, api) {
      if (f.W < 8 || f.H < 8) return;
      const t = f.t;
      hx += (inp.x - hx) * damp(f.dt, 13);
      hx = clamp(hx, 0.06, 0.94);
      g.heroX = hx * f.W;
      g.heroY = f.floorY - 0.035 * f.H;
      g.tilt = clamp((inp.x - hx) * 1.1, -0.4, 0.4);

      /* ── difficulty ───────────────────────────────────────────────── */
      const rush = rushT > 0;
      if (rush) rushT = Math.max(0, rushT - f.dt);
      const mudChance = rush ? 0 : t < 20 ? 0.13 : t < 40 ? 0.24 : 0.32;
      const fall = lerp(0.30, 0.62, ramp(t, 0, 52));
      /* wind only from ~22s — the first escalation you can SEE */
      const windAmp = 0.115 * ramp(t, 22, 46);
      const wind = Math.sin(t * 0.5 + windPh) * windAmp;

      spawnT -= f.dt;
      if (spawnT <= 0 && drops.length < MAX_DROPS) {
        const clutch = rush ? 2 : t < 20 ? 1 : t < 40 ? (rnd() < 0.35 ? 2 : 1) : 1 + ((rnd() * 3) | 0);
        for (let c = 0; c < clutch && drops.length < MAX_DROPS; c++) {
          const bad = rnd() < mudChance;
          /* never drop mud straight onto the player's head */
          let x = 0.08 + rnd() * 0.84;
          for (let tries = 0; bad && tries < 5 && Math.abs(x - hx) < 0.15; tries++) x = 0.08 + rnd() * 0.84;
          const gold = !bad && !rush && rnd() < 0.05 + 0.03 * ramp(t, 8, 45);
          drops.push({
            x, y: -0.12 - c * 0.07,
            vx: 0,
            vy: fall * (0.88 + rnd() * 0.3) * (bad ? 1.1 : 1),
            r: bad ? 26 : gold ? 25 : 23,
            kind: bad ? 2 : gold ? 1 : 0,
            seed: rnd() * 10,
          });
        }
        spawnT = lerp(0.78, 0.32, ramp(t, 0, 50)) * (rush ? 0.5 : 1) * (0.85 + rnd() * 0.3);
      }

      /* ── movement + collision ─────────────────────────────────────── */
      const heroR = 44 * f.sizeF;
      const floorN = f.floorY / f.H;
      for (let i = drops.length - 1; i >= 0; i--) {
        const e = drops[i];
        e.vx += (wind * (e.kind === 2 ? 0.7 : 1) - e.vx) * damp(f.dt, 2.2);
        e.x += e.vx * f.dt;
        e.y += e.vy * f.dt;
        if (e.x < 0.04) { e.x = 0.04; e.vx = Math.abs(e.vx); }
        if (e.x > 0.96) { e.x = 0.96; e.vx = -Math.abs(e.vx); }
        const ex = e.x * f.W, ey = e.y * f.H, er = e.r * f.sizeF;

        if (e.y > -0.02) {
          const dx = Math.abs(ex - g.heroX), dy = Math.abs(ey - g.heroY);
          /* goodies: generous box. mud: tight box. */
          const k = e.kind === 2 ? 0.7 : 1.15;
          if (dx < (heroR + er) * k && dy < (heroR + er) * k * 0.85) {
            drops.splice(i, 1);
            if (e.kind === 2) {
              api.hurt();
              api.pop(ex, ey - 34 * f.sizeF, "SPLAT!", "#ff8a5c");
              api.burst(ex, ey, "#6b3f1c", 16);
              streak = 0; nextMile = 5;
              continue;
            }
            streak++;
            if (e.kind === 1) {
              rushT = 5;
              api.score(25);
              api.burst(ex, ey, "#ffd233", 34);
              api.pop(ex, ey - 40 * f.sizeF, "GOLDEN RUSH!", "#ffd233");
              api.shake(0.5);
            } else {
              api.score(rush ? 30 : 10);
              api.burst(ex, ey, rush ? "#ffd233" : "#fff3c4", rush ? 16 : 11);
              api.pop(ex, ey - 30 * f.sizeF, rush ? "+30" : "+10", rush ? "#ffd233" : "#ffffff");
              api.shake(0.1);
            }
            if (streak >= nextMile) {
              const words = ["NICE!", "GREAT!", "AMAZING!", "WOW!", "EGG-CELLENT!"];
              const w = words[Math.min(words.length - 1, ((nextMile / 5) | 0) - 1)];
              api.score(15);
              api.pop(g.heroX, g.heroY - 78 * f.sizeF, `${w} ×${streak}`, "#fb66e5");
              api.burst(g.heroX, g.heroY - 30 * f.sizeF, "#fb66e5", 24);
              api.shake(0.34);
              nextMile += 5;
            }
            continue;
          }
        }

        if (e.y > floorN + 0.045) {
          drops.splice(i, 1);
          splats.push({ x: ex, t0: t, good: e.kind !== 2 });
          if (splats.length > 8) splats.shift();
          if (e.kind !== 2 && streak > 0) {
            api.pop(ex, f.floorY - 16 * f.sizeF, "oh no…", "#c9b8a8");
            streak = 0; nextMile = 5;
          }
        }
      }
      for (let i = splats.length - 1; i >= 0; i--) if (t - splats[i].t0 > 0.7) splats.splice(i, 1);
    },

    draw(ctx, f) {
      /* landing shadows tell you where each thing will arrive */
      for (const e of drops) {
        const near = clamp((e.y * f.H) / Math.max(1, f.floorY), 0.1, 1);
        const er = e.r * f.sizeF;
        softShade(
          ctx,
          (e.x + e.vx * 0.35) * f.W, f.floorY + 8 * f.sizeF,
          er * (0.5 + near * 0.7), er * 0.24 * (0.5 + near * 0.6),
          0.3 * near, e.kind === 2 ? "120,40,20" : "40,60,20",
        );
      }
      /* splats */
      for (const s of splats) {
        const p = clamp01((f.t - s.t0) / 0.7);
        ctx.save();
        ctx.globalAlpha = (1 - p) * 0.85;
        ctx.translate(s.x, f.floorY + 6 * f.sizeF);
        ctx.fillStyle = s.good ? "#ffe9b8" : "#6b3f1c";
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + s.t0;
          const d = (10 + p * 26) * f.sizeF;
          ctx.beginPath();
          ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.3, 5 * f.sizeF * (1 - p * 0.5), 3.4 * f.sizeF * (1 - p * 0.5), 0, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
      /* the drops */
      for (const e of drops) {
        if (e.y < -0.06) continue;
        ctx.save();
        ctx.translate(e.x * f.W, e.y * f.H);
        if (e.kind === 2) paintMud(ctx, e.r * f.sizeF, f.t, e.seed);
        else paintEgg(ctx, e.r * f.sizeF, f.t, e.seed, e.kind === 1);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    drawFront(ctx, f) {
      /* golden rush wash */
      if (rushT > 0) {
        const k = Math.min(1, rushT / 0.6);
        ctx.save();
        ctx.globalAlpha = 0.17 * k;
        const gd = ctx.createRadialGradient(f.W / 2, f.H * 0.4, 10, f.W / 2, f.H * 0.4, Math.max(f.W, f.H) * 0.75);
        gd.addColorStop(0, "#fff3b0");
        gd.addColorStop(1, "#ffb01a");
        ctx.fillStyle = gd;
        ctx.fillRect(0, 0, f.W, f.H);
        ctx.restore();
      }
      /* chevrons for anything still above the screen */
      for (const e of drops) {
        if (e.y >= -0.02) continue;
        chevron(ctx, e.x * f.W, 34 * f.sizeF, f.sizeF * 1.3, e.kind === 2 ? "#ff5a3c" : e.kind === 1 ? "#ffd233" : "#ffffff", f.t + e.seed);
      }
      /* streak flame over the hero */
      if (streak >= 3) {
        ctx.save();
        ctx.translate(g.heroX, g.heroY - 62 * f.sizeF);
        ctx.globalAlpha = 0.9;
        ctx.font = `900 ${Math.round(15 * f.sizeF) + 8}px 'Baloo 2', sans-serif`;
        ctx.textAlign = "center";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(3, 4 * f.sizeF);
        ctx.strokeStyle = "rgba(43,38,34,0.85)";
        const label = `🔥 ${streak}`;
        ctx.strokeText(label, 0, 0);
        ctx.fillStyle = "#ffd233";
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  };
  return g;
}

/* ══ FARM 2 · Mole Mash ══════════════════════════════════════════════════
   Rebuilt from the shared `whack` engine: 7 staggered holes in two rows,
   the hero IS the hammer (it follows your finger), every pop-up is
   telegraphed by shaking dirt, and the rate/lifetime/count all ramp.
   Mechanic: BUCKET-HEAD moles take two bonks and pay double.             */

interface Pop { hole: number; kind: 0 | 1 | 2; born: number; life: number; hits: number; seed: number }
/** x is a fraction of W, y a fraction of the ground band below floorY. */
const HOLES: { x: number; y: number; s: number }[] = [
  { x: 0.26, y: 0.20, s: 0.84 }, { x: 0.50, y: 0.20, s: 0.84 }, { x: 0.74, y: 0.20, s: 0.84 },
  { x: 0.14, y: 0.60, s: 1 }, { x: 0.38, y: 0.60, s: 1 }, { x: 0.62, y: 0.60, s: 1 }, { x: 0.86, y: 0.60, s: 1 },
];
const holeX = (f: Frame, i: number) => HOLES[i].x * f.W;
const holeY = (f: Frame, i: number) => f.floorY + Math.max(46 * f.sizeF, f.H - f.floorY) * HOLES[i].y;
const WARN = 0.26, RISE = 0.17, DUCK = 0.18;
/** 0 (underground) → 1 (fully up), with a warn delay and a duck at the end. */
function popUp(age: number, life: number) {
  if (age < WARN) return 0;
  if (age < WARN + RISE) return easeOut((age - WARN) / RISE);
  if (age < life) return 1;
  return 1 - easeOut((age - life) / DUCK);
}

function moleMash(): GameInstance {
  const pops: Pop[] = [];
  const rings: { x: number; y: number; t0: number; col: string }[] = [];
  let spawnT = 0.45;
  let chain = 0, nextMile = 5;
  let smash = -9;               // time of the last swing
  let px = 0.5, py = 0.7;       // smoothed hammer position (normalised)
  let lastHitHole = -1, lastHitT = -9;
  let api: GameAPI | null = null;

  const swingAt = (f: Frame, x: number, y: number) => {
    if (!api) return;
    smash = f.t;
    const R = 56 * f.sizeF;
    let best = -1, bestD = 1e9;
    for (let i = 0; i < pops.length; i++) {
      const p = pops[i];
      const up = popUp(f.t - p.born, p.life);
      if (up < 0.32) continue;
      const hx = holeX(f, p.hole);
      const hy = holeY(f, p.hole) - up * 36 * f.sizeF * HOLES[p.hole].s;
      const d = Math.hypot(x - hx, y - hy);
      if (d < R + 22 * f.sizeF * HOLES[p.hole].s && d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) {
      api.blip();
      rings.push({ x, y, t0: f.t, col: "#e9dcc6" });
      if (rings.length > 10) rings.shift();
      return;
    }
    const p = pops[best];
    const hx = holeX(f, p.hole);
    const hy = holeY(f, p.hole) - 30 * f.sizeF;
    rings.push({ x: hx, y: hy, t0: f.t, col: p.kind === 2 ? "#ff8a5c" : "#ffd233" });
    if (rings.length > 10) rings.shift();
    lastHitHole = p.hole; lastHitT = f.t;

    if (p.kind === 2) {                         // bunny — never hit these
      pops.splice(best, 1);
      api.hurt();
      api.pop(hx, hy - 34 * f.sizeF, "OOPS!", "#ff8a5c");
      api.burst(hx, hy, "#f7f2e8", 18);
      chain = 0; nextMile = 5;
      return;
    }
    if (p.kind === 1 && p.hits === 0) {          // knock the bucket off first
      p.hits = 1;
      p.life = Math.max(p.life, f.t - p.born + 0.75);
      api.score(5);
      api.blip();
      api.burst(hx, hy - 18 * f.sizeF, "#e4edf5", 16);
      api.pop(hx, hy - 40 * f.sizeF, "CLANG!", "#cfe0ee");
      api.shake(0.22);
      return;
    }
    pops.splice(best, 1);
    chain++;
    const dbl = p.kind === 1;
    api.score(dbl ? 25 : 10);
    api.burst(hx, hy, dbl ? "#ffd233" : "#c08a5a", dbl ? 26 : 14);
    api.pop(hx, hy - 34 * f.sizeF, dbl ? "BONK! +25" : "+10", dbl ? "#ffd233" : "#ffffff");
    api.shake(dbl ? 0.4 : 0.16);
    if (chain >= nextMile) {
      const words = ["NICE!", "SUPER!", "UNREAL!", "WOW!"];
      api.score(15);
      api.pop(f.W * 0.5, f.floorY - 24 * f.sizeF, `${words[Math.min(3, ((nextMile / 5) | 0) - 1)]} ×${chain}`, "#fb66e5");
      api.burst(f.W * 0.5, f.floorY - 24 * f.sizeF, "#fb66e5", 26);
      api.shake(0.36);
      nextMile += 5;
    }
  };

  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 0.86,
    hint: "Drag your creature over a mole and TAP — never bonk a bunny!",

    onDown(f, inp) { swingAt(f, inp.x * f.W, inp.y * f.H); },

    update(f, inp, a) {
      if (f.W < 8 || f.H < 8) return;
      api = a;
      const t = f.t;
      /* hammer follows the finger, hovering just above it */
      px += (inp.x - px) * damp(f.dt, 18);
      py += (inp.y - py) * damp(f.dt, 18);
      const sw = clamp01((t - smash) / 0.24);
      const slam = smash > -1 ? Math.sin(sw * Math.PI) : 0;
      g.heroX = clamp(px * f.W, 26 * f.sizeF, f.W - 26 * f.sizeF);
      g.heroY = clamp(py * f.H - 52 * f.sizeF + slam * 26 * f.sizeF, 66 * f.sizeF, f.H - 22 * f.sizeF);
      g.tilt = -0.5 + slam * 0.75 + Math.sin(t * 3) * 0.05;
      g.heroScale = 0.86 * (1 + (1 - sw) * 0.12 * (smash > -1 ? 1 : 0) - slam * 0.06);

      /* ── difficulty ───────────────────────────────────────────────── */
      const life = lerp(1.8, 0.9, ramp(t, 0, 50));
      const bunnyP = 0.14 + 0.2 * ramp(t, 8, 46);
      const helmetP = 0.24 * ramp(t, 12, 40);
      const batch = t < 22 ? 1 : t < 42 ? (rnd() < 0.45 ? 2 : 1) : 1 + ((rnd() * 3) | 0);

      spawnT -= f.dt;
      if (spawnT <= 0) {
        const busy = new Set(pops.map((p) => p.hole));
        const hasMole = pops.some((p) => p.kind !== 2);
        for (let b = 0; b < batch; b++) {
          const free: number[] = [];
          for (let i = 0; i < HOLES.length; i++) if (!busy.has(i)) free.push(i);
          if (!free.length) break;
          const hole = free[(rnd() * free.length) | 0];
          busy.add(hole);
          /* fairness: no bunny where a mole just died (the finger is there),
             and always keep at least one bonkable mole on the board */
          const fresh = hole === lastHitHole && t - lastHitT < 0.4;
          let kind: 0 | 1 | 2 = rnd() < bunnyP ? 2 : rnd() < helmetP ? 1 : 0;
          if ((fresh || (!hasMole && b === 0)) && kind === 2) kind = 0;
          pops.push({ hole, kind, born: t, life, hits: 0, seed: rnd() * 10 });
        }
        spawnT = lerp(0.95, 0.42, ramp(t, 0, 48)) * (0.8 + rnd() * 0.4);
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        if (t - pops[i].born > pops[i].life + DUCK) pops.splice(i, 1);
      }
      for (let i = rings.length - 1; i >= 0; i--) if (t - rings[i].t0 > 0.45) rings.splice(i, 1);
    },

    draw(ctx, f) {
      for (let h = 0; h < HOLES.length; h++) {
        const hx = holeX(f, h), hy = holeY(f, h), s = HOLES[h].s * f.sizeF;
        /* mound + hole mouth */
        ctx.fillStyle = "#a37b4e";
        ctx.beginPath();
        ctx.ellipse(hx, hy + 5 * s, 40 * s, 13 * s, 0, 0, TAU);
        ctx.fill();
        softShade(ctx, hx, hy + 2 * s, 30 * s, 10 * s, 0.75, "58,36,18");
        /* dirt jiggle telegraph */
        const p = pops.find((q) => q.hole === h);
        if (p) {
          const age = f.t - p.born;
          if (age < WARN) {
            const k = 1 - age / WARN;
            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = "#8a5a3b";
            for (let i = 0; i < 5; i++) {
              const a = (i / 5) * TAU + f.t * 9;
              ctx.beginPath();
              ctx.arc(hx + Math.cos(a) * 18 * s * (1 - k), hy - 4 * s - (1 - k) * 14 * s + Math.sin(a) * 4 * s, 3 * s, 0, TAU);
              ctx.fill();
            }
            ctx.restore();
          }
        }
      }
      /* pop-ups, back row first */
      for (const p of pops) {
        const age = f.t - p.born;
        const up = popUp(age, p.life);
        if (up <= 0.001) continue;
        const s = HOLES[p.hole].s * f.sizeF;
        const hx = holeX(f, p.hole), hy = holeY(f, p.hole);
        ctx.save();
        ctx.beginPath();          // clip so they truly emerge from the hole
        ctx.rect(hx - 52 * s, -9999, 104 * s, hy + 9999 + 2 * s);
        ctx.clip();
        ctx.translate(hx, hy + 6 * s - up * 40 * s);
        ctx.scale(1, 0.55 + up * 0.45);
        if (p.kind === 2) paintBunny(ctx, 30 * s, f.t, p.seed);
        else paintMole(ctx, 30 * s, f.t, p.seed, p.kind === 1 && p.hits === 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    drawFront(ctx, f) {
      /* where your tap will land */
      const tx = clamp(px * f.W, 0, f.W), ty = clamp(py * f.H, 0, f.H);
      const sw = clamp01((f.t - smash) / 0.24);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(f.t * 4);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3 * f.sizeF;
      ctx.setLineDash([7 * f.sizeF, 6 * f.sizeF]);
      ctx.beginPath();
      ctx.ellipse(tx, ty, 40 * f.sizeF * (1 + (1 - sw) * 0.25), 15 * f.sizeF, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      /* impact rings */
      for (const r of rings) {
        const p = clamp01((f.t - r.t0) / 0.45);
        ctx.save();
        ctx.globalAlpha = (1 - p) * 0.8;
        ctx.strokeStyle = r.col;
        ctx.lineWidth = 4 * f.sizeF * (1 - p);
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, (14 + p * 54) * f.sizeF, (6 + p * 22) * f.sizeF, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    },
  };
  return g;
}

/* ══ FARM 3 · Pumpkin Punt ═══════════════════════════════════════════════
   Breakout with a readable paddle. Mechanic: smash the GOLDEN CORN to split
   into THREE pumpkins — and you only lose a heart when the LAST one drops. */

interface Ball { x: number; y: number; vx: number; vy: number; spin: number; stuck: boolean }
interface Targ { x: number; y: number; kind: 0 | 1; alive: boolean; seed: number }
const MAX_BALLS = 5, MAX_TARGS = 24;

/** Reflect a value back and forth inside [lo,hi] — used for aim prediction. */
function fold(v: number, lo: number, hi: number) {
  const span = hi - lo;
  if (span <= 0.001) return lo;
  let u = (v - lo) % (2 * span);
  if (u < 0) u += 2 * span;
  return lo + (u <= span ? u : 2 * span - u);
}

function pumpkinPunt(): GameInstance {
  let padX = 0.5;
  let wave = 0, serveT = 1.3, ready = false;
  let speed = 300;
  const balls: Ball[] = [];
  const targs: Targ[] = [];

  const padPlane = (f: Frame) => f.H - 66 * f.sizeF;
  const halfW = (f: Frame) => 66 * f.sizeF;

  const makeWave = (f: Frame) => {
    targs.length = 0;
    const rows = Math.min(4, 2 + Math.min(2, wave));
    const golds = f.t > 40 ? 2 : wave >= 1 ? 1 : 0;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < 5 && targs.length < MAX_TARGS; i++) {
        targs.push({ x: 0.14 + i * 0.18, y: 0.155 + r * 0.082, kind: 0, alive: true, seed: rnd() * 10 });
      }
    }
    for (let n = 0; n < golds; n++) {
      const pick = targs[(rnd() * targs.length) | 0];
      if (pick) pick.kind = 1;
    }
  };
  const serve = (f: Frame) => {
    balls.length = 0;
    balls.push({ x: padX * f.W, y: padPlane(f) - 30 * f.sizeF, vx: 0, vy: 0, spin: 0, stuck: true });
    serveT = 1.3;
  };
  const launch = (f: Frame) => {
    const b = balls[0];
    if (!b || !b.stuck) return;
    b.stuck = false;
    const a = -Math.PI / 2 + (rnd() - 0.5) * 0.7;
    b.vx = Math.cos(a) * speed * f.sizeF;
    b.vy = Math.sin(a) * speed * f.sizeF;
  };
  /** target x/y in canvas px, including the late-game sway. */
  const tPos = (f: Frame, tg: Targ) => {
    const sway = f.t < 20 ? 0 : (f.t < 40 ? 0.032 : 0.055) * Math.sin(f.t * 0.9 + tg.seed);
    return { x: (tg.x + sway) * f.W, y: tg.y * f.H };
  };

  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    hint: "Bounce it with your middle for a PERFECT punt!",

    onDown(f) { if (ready) launch(f); },

    update(f, inp, api) {
      if (f.W < 8 || f.H < 8) return;
      if (!ready) { makeWave(f); serve(f); ready = true; }
      padX += (inp.x - padX) * damp(f.dt, 14);
      padX = clamp(padX, 0.08, 0.92);
      g.heroX = padX * f.W;
      g.heroY = padPlane(f) + 34 * f.sizeF;
      g.tilt = clamp((inp.x - padX) * 0.9, -0.35, 0.35);

      speed = lerp(272, 348, ramp(f.t, 6, 46)) * (1 + wave * 0.05);
      const sp = Math.min(speed, 400) * f.sizeF;
      const br = 16 * f.sizeF;
      const plane = padPlane(f);

      if (balls.length === 1 && balls[0].stuck) {
        balls[0].x = g.heroX;
        balls[0].y = plane - 30 * f.sizeF;
        serveT -= f.dt;
        if (serveT <= 0) launch(f);
      }

      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        if (b.stuck) continue;
        b.spin += f.dt * 5;
        /* keep every ball at the current wave speed — never runaway */
        const m = Math.hypot(b.vx, b.vy) || 1;
        b.vx = (b.vx / m) * sp; b.vy = (b.vy / m) * sp;
        b.x += b.vx * f.dt; b.y += b.vy * f.dt;
        if (b.x < br) { b.x = br; b.vx = Math.abs(b.vx); api.blip(); }
        if (b.x > f.W - br) { b.x = f.W - br; b.vx = -Math.abs(b.vx); api.blip(); }
        if (b.y < br + 54 * f.sizeF) { b.y = br + 54 * f.sizeF; b.vy = Math.abs(b.vy); api.blip(); }

        /* paddle */
        if (b.vy > 0 && Math.abs(b.x - g.heroX) < halfW(f) + br * 0.6 && b.y > plane - 22 * f.sizeF && b.y < plane + 26 * f.sizeF) {
          b.y = plane - 22 * f.sizeF;
          const off = clamp((b.x - g.heroX) / halfW(f), -1, 1);
          const ang = -Math.PI / 2 + off * 1.05;
          b.vx = Math.cos(ang) * sp;
          b.vy = Math.sin(ang) * sp;
          if (Math.abs(b.vy) < sp * 0.42) b.vy = -sp * 0.42;
          api.blip();
          api.burst(b.x, b.y + 10 * f.sizeF, "#ffd233", 7);
          if (Math.abs(off) < 0.26) {
            api.score(5);
            api.pop(b.x, b.y - 34 * f.sizeF, "PERFECT!", "#00c2b9");
            api.burst(b.x, b.y, "#00c2b9", 18);
            api.shake(0.2);
          }
        }

        /* targets */
        for (const tg of targs) {
          if (!tg.alive) continue;
          const p = tPos(f, tg);
          if (Math.hypot(b.x - p.x, b.y - p.y) > br + 22 * f.sizeF) continue;
          tg.alive = false;
          /* bounce away from the target centre so it never tunnels */
          const dx = b.x - p.x, dy = b.y - p.y;
          if (Math.abs(dy) >= Math.abs(dx)) b.vy = Math.sign(dy || 1) * Math.abs(b.vy);
          else b.vx = Math.sign(dx || 1) * Math.abs(b.vx);
          if (tg.kind === 1) {
            api.score(20);
            api.burst(p.x, p.y, "#ffd233", 30);
            api.pop(p.x, p.y - 30 * f.sizeF, "MULTI-BALL!", "#ffd233");
            api.shake(0.45);
            for (let n = 0; n < 2 && balls.length < MAX_BALLS; n++) {
              const a = -Math.PI / 2 + (n === 0 ? -0.8 : 0.8);
              balls.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, spin: 0, stuck: false });
            }
          } else {
            api.score(10);
            api.burst(p.x, p.y, "#ffd233", 13);
            api.pop(p.x, p.y - 26 * f.sizeF, "+10", "#ffffff");
            api.shake(0.12);
          }
          break;
        }

        if (b.y > f.H + 40 * f.sizeF) {
          balls.splice(i, 1);
          if (balls.length > 0) api.pop(clamp(b.x, 30, f.W - 30), f.H - 90 * f.sizeF, "still going!", "#ffd233");
        }
      }

      if (balls.length === 0) { api.hurt(); serve(f); }

      if (targs.length > 0 && !targs.some((tg) => tg.alive)) {
        wave++;
        api.score(25);
        api.pop(f.W * 0.5, f.H * 0.34, "WAVE CLEAR!", "#fb66e5");
        for (let n = 0; n < 3; n++) api.burst(f.W * (0.25 + n * 0.25), f.H * 0.3, undefined, 22);
        api.shake(0.55);
        makeWave(f);
      }
    },

    draw(ctx, f) {
      for (const tg of targs) {
        if (!tg.alive) continue;
        const p = tPos(f, tg);
        ctx.save();
        ctx.translate(p.x, p.y);
        if (tg.kind === 1) paintCorn(ctx, 17 * f.sizeF, f.t, tg.seed);
        else paintStarTarget(ctx, 17 * f.sizeF, f.t, tg.seed);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    drawFront(ctx, f) {
      const plane = padPlane(f), hw = halfW(f);
      /* the paddle bar — the hero drawing can be any shape, so SHOW the bat */
      ctx.save();
      ctx.translate(g.heroX, plane + 4 * f.sizeF);
      ctx.rotate(g.tilt * 0.35);
      ctx.beginPath();
      ctx.roundRect(-hw, -9 * f.sizeF, hw * 2, 18 * f.sizeF, 9 * f.sizeF);
      const gd = ctx.createLinearGradient(-hw, 0, hw, 0);
      gd.addColorStop(0, "#b06a2a");
      gd.addColorStop(0.5, "#ffcf7a");
      gd.addColorStop(1, "#b06a2a");
      ctx.fillStyle = gd;
      ctx.fill();
      inkStroke(ctx, 3.2 * f.sizeF);
      /* sweet spot */
      ctx.beginPath();
      ctx.roundRect(-hw * 0.26, -6 * f.sizeF, hw * 0.52, 12 * f.sizeF, 6 * f.sizeF);
      ctx.fillStyle = `rgba(0,194,185,${0.55 + 0.35 * Math.sin(f.t * 5)})`;
      ctx.fill();
      inkStroke(ctx, 2.2 * f.sizeF);
      ctx.restore();

      /* where the lowest descending pumpkin will cross the paddle line */
      let aim: Ball | null = null;
      for (const b of balls) if (!b.stuck && b.vy > 0 && b.y > f.H * 0.35 && (!aim || b.y > aim.y)) aim = b;
      if (aim) {
        const br = 16 * f.sizeF;
        const tt = (plane - 22 * f.sizeF - aim.y) / Math.max(1, aim.vy);
        if (tt > 0 && tt < 4) {
          const hitX = fold(aim.x + aim.vx * tt, br, f.W - br);
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 3 * f.sizeF;
          ctx.setLineDash([6 * f.sizeF, 7 * f.sizeF]);
          ctx.beginPath();
          ctx.moveTo(hitX, plane - 22 * f.sizeF);
          ctx.lineTo(hitX, plane - 4 * f.sizeF);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.ellipse(hitX, plane - 2 * f.sizeF, 11 * f.sizeF, 5 * f.sizeF, 0, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
      }

      /* the pumpkins themselves ride above the hero so they never hide */
      for (const b of balls) {
        const pr = 16 * f.sizeF;
        if (b.stuck) {
          const k = clamp01(serveT / 1.3);
          ctx.save();
          ctx.globalAlpha = 0.75;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 3 * f.sizeF;
          ctx.beginPath();
          ctx.arc(b.x, b.y, pr + 16 * f.sizeF * k, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.sin(b.spin) * 0.3);
        ctx.beginPath();
        ctx.arc(0, 0, pr, 0, TAU);
        const gd2 = ctx.createRadialGradient(-pr * 0.3, -pr * 0.35, pr * 0.15, 0, 0, pr);
        gd2.addColorStop(0, "#ffc06a");
        gd2.addColorStop(1, "#f07a12");
        ctx.fillStyle = gd2;
        ctx.fill();
        inkStroke(ctx, 3 * f.sizeF);
        ctx.strokeStyle = "#c65c08";
        ctx.lineWidth = 2 * f.sizeF;
        for (const off of [-0.5, 0.5]) {
          ctx.beginPath();
          ctx.ellipse(off * pr * 0.5, 0, pr * 0.42, pr * 0.92, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.fillStyle = "#3aae3a";
        ctx.beginPath();
        ctx.roundRect(-2.6 * f.sizeF, -pr - 7 * f.sizeF, 5.2 * f.sizeF, 9 * f.sizeF, 2 * f.sizeF);
        ctx.fill();
        inkStroke(ctx, 2.2 * f.sizeF);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    },
  };
  return g;
}

/* ── factory ────────────────────────────────────────────────────────────── */

export function farmGame(id: string): GameInstance | null {
  switch (id) {
    case "eggCatch": return eggCatch();
    case "moleMash": return moleMash();
    case "pumpkinPunt": return pumpkinPunt();
    default: return null;
  }
}
