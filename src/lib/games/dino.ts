// ─── DINO mini-games: Lava Leap · Meteor Dodge · Cliff Hopper ───────────────
// Warm and adventurous, never scary: falls end in a puff of ferns, "lava" is
// a glowing puddle you hop over, meteors are friendly glowing pebbles.
// House rules: coyote time + input buffering on anything timing-based, every
// gap provably clearable, hazards telegraphed before they can touch you.
import {
  clamp, clamp01, damp, lerp, rnd,
  type Frame, type GameInstance, type GameMeta,
} from "./core";

export const DINO_GAMES: GameMeta[] = [
  {
    id: "lavaLeap",
    title: "Lava Leap",
    emoji: "🌋",
    how: "TAP to jump, tap again for a DOUBLE jump. Hop the rocks and lava puddles, scoop up eggs — and ride a steam puff up to the sky eggs!",
  },
  {
    id: "meteorDodge",
    title: "Meteor Dodge",
    emoji: "☄️",
    how: "SLIDE to dodge falling star-rocks. The CLOSER you dodge, the bigger the WHOOSH points — and grab an egg if you dare!",
  },
  {
    id: "cliffHopper",
    title: "Cliff Hopper",
    emoji: "🦕",
    how: "HOLD to fill the power bar, LET GO to leap. Watch the dotted arc and land right on the glowing bullseye for a PERFECT!",
  },
];

/* ── shared helpers ────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;
const INK = "#241a20";
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

function inkStroke(ctx: CanvasRenderingContext2D, w: number, col = INK) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1.2, w);
  ctx.stroke();
}

/** Bright rim so a dark rock still pops off the dusk sky. */
function rim(ctx: CanvasRenderingContext2D, w: number, col = "#ffcf8a") {
  ctx.lineJoin = "round";
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1, w);
  ctx.stroke();
}

function chevron(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, pulse: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(pulse * 9) * 3 * s);
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(pulse * 9);
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

/** Angular spiky boulder — the "do not touch" silhouette. */
function paintRock(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.beginPath();
  const pts = 7;
  for (let i = 0; i < pts; i++) {
    const a = -Math.PI / 2 + (i / pts) * TAU;
    const k = 0.72 + ((Math.sin(seed * 3.1 + i * 2.7) + 1) / 2) * 0.42;
    const px = Math.cos(a) * r * k, py = Math.sin(a) * r * k * 0.92;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "#3a2b33";
  ctx.fill();
  rim(ctx, r * 0.17, "#ff9a5c");
  ctx.strokeStyle = "#ff7a45";
  ctx.lineWidth = Math.max(1, r * 0.11);
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.3); ctx.lineTo(-r * 0.05, r * 0.18);
  ctx.moveTo(r * 0.22, -r * 0.2); ctx.lineTo(r * 0.4, r * 0.3);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 4 + seed);
  ctx.fillStyle = "#ff7a45";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Flat glowing puddle — wide and low, clearly a floor hazard. */
function paintPuddle(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  ctx.save();
  ctx.globalAlpha = 0.4 + 0.2 * Math.sin(t * 3 + seed);
  const gl = ctx.createRadialGradient(0, 0, h * 0.3, 0, 0, w * 0.7);
  gl.addColorStop(0, "rgba(255,160,60,0.9)");
  gl.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.7, h * 2.4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.5, h, 0, 0, TAU);
  const gd = ctx.createLinearGradient(0, -h, 0, h);
  gd.addColorStop(0, "#ffd166");
  gd.addColorStop(0.5, "#ff8b3d");
  gd.addColorStop(1, "#d63f10");
  ctx.fillStyle = gd;
  ctx.fill();
  inkStroke(ctx, h * 0.3, "#7a2a08");
  /* bubbles */
  ctx.fillStyle = "#fff0c4";
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.9 + i * 0.31 + seed) % 1;
    ctx.globalAlpha = (1 - ph) * 0.8;
    ctx.beginPath();
    ctx.arc((-0.36 + i * 0.24) * w, -ph * h * 1.6, h * 0.22 * (0.4 + ph), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Cream egg with green spots — the friendly pickup shape. */
function paintDinoEgg(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.save();
  ctx.globalAlpha = 0.3 + 0.18 * Math.sin(t * 5 + seed);
  ctx.fillStyle = "#9fe8a0";
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.25, r * 1.45, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.rotate(Math.sin(t * 3 + seed) * 0.14);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.64, r * 0.84, 0, 0, TAU);
  ctx.fillStyle = "#fdf3dd";
  ctx.fill();
  inkStroke(ctx, r * 0.17);
  ctx.fillStyle = "#3aae3a";
  ctx.beginPath();
  ctx.arc(-r * 0.14, -r * 0.22, r * 0.16, 0, TAU);
  ctx.arc(r * 0.22, r * 0.16, r * 0.13, 0, TAU);
  ctx.arc(-r * 0.02, r * 0.44, r * 0.1, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(-r * 0.24, -r * 0.36, r * 0.13, r * 0.2, -0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Rising steam column — the rideable updraft. Soft, friendly, obviously not a rock. */
function paintVent(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  ctx.save();
  const gd = ctx.createLinearGradient(0, 0, 0, -h);
  gd.addColorStop(0, "rgba(180,240,255,0.55)");
  gd.addColorStop(1, "rgba(180,240,255,0)");
  ctx.fillStyle = gd;
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, 0);
  ctx.lineTo(-w * 0.75, -h);
  ctx.lineTo(w * 0.75, -h);
  ctx.lineTo(w * 0.5, 0);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 7; i++) {
    const ph = ((t * 0.75 + i / 7 + seed) % 1);
    ctx.globalAlpha = (1 - ph) * 0.65;
    ctx.fillStyle = "#e7fbff";
    ctx.beginPath();
    ctx.arc(Math.sin(t * 1.6 + i * 1.9) * w * 0.34, -ph * h, w * (0.16 + ph * 0.3), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  /* the vent mouth — a stone ring, so the ground reads as solid */
  ctx.fillStyle = "#5c4a3e";
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.55, w * 0.17, 0, 0, TAU);
  ctx.fill();
  rim(ctx, w * 0.05, "#a8e7f5");
  ctx.restore();
}

/* ══ DINO 1 · Lava Leap ══════════════════════════════════════════════════
   Tap-to-jump runner with coyote time and a jump buffer. Mechanic: STEAM
   VENTS boost you sky-high onto a trail of eggs — an air chain worth a
   fat bonus. Every gap is generated so a late jumper still clears it.    */

interface Obs {
  wx: number; kind: 0 | 1 | 2 | 3; w: number; h: number; y: number; seed: number; hit: boolean;
}
const MAX_OBS = 44;
const LL_G = 2300, LL_J1 = 880, LL_J2 = 760, LL_VENT = 1180;

function lavaLeap(): GameInstance {
  let scroll = 0, nextX = 0;
  let feet = 0, vy = 0, air = 0;      // air = jumps already used
  let coyote = 0, buffer = 0, land = -9, ventCd = 0;
  let started = false;
  let chain = 0;
  const obs: Obs[] = [];

  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 0.95,
    hint: "TAP to jump — tap again in the air for a double jump!",

    onDown() { buffer = 0.16; },

    update(f, _inp, api) {
      if (f.W < 8 || f.H < 8) return;
      const s = f.sizeF, t = f.t;
      const groundY = f.floorY - 6 * s;
      if (!started) {
        feet = groundY;
        for (let i = 0; i < 3; i++) {
          obs.push({ wx: f.W * (0.52 + i * 0.11), kind: 3, w: 0, h: 0, y: 36 * s, seed: rnd() * 10, hit: false });
        }
        nextX = f.W * 0.95;
        started = true;
      }

      const spd = Math.min(430, 215 + 3.6 * t) * s;
      const jd = (2 * LL_J1 / LL_G) * spd;      // horizontal reach of one jump
      const heroR = 40 * s, heroHalf = 26 * s;

      /* ── jump: coyote time + input buffer ─────────────────────────── */
      const onGround = feet >= groundY - 0.6;
      if (onGround) { coyote = 0.13; } else { coyote = Math.max(0, coyote - f.dt); }
      buffer = Math.max(0, buffer - f.dt);
      if (buffer > 0) {
        if (onGround || coyote > 0) { vy = -LL_J1 * s; air = 1; coyote = 0; buffer = 0; api.blip(); }
        else if (air === 1) {
          vy = -LL_J2 * s; air = 2; buffer = 0; api.blip();
          api.burst(f.W * 0.25, feet - 20 * s, "#bff0ff", 10);
        }
      }
      vy += LL_G * s * f.dt;
      feet += vy * f.dt;
      if (feet >= groundY) {
        if (vy > 260 * s) {
          api.burst(f.W * 0.25, groundY, "#c9a87e", 9);
          if (chain >= 3) {
            api.score(10 + chain * 5);
            api.pop(f.W * 0.25, groundY - 110 * s, `AIR CHAIN ×${chain}!`, "#7ce7ff");
            api.burst(f.W * 0.25, groundY - 80 * s, "#7ce7ff", 26);
            api.shake(0.4);
          }
          chain = 0;
        }
        feet = groundY; vy = 0; air = 0; land = t;
      }
      const airborne = feet < groundY - 1;
      const squash = Math.max(0, 1 - (t - land) / 0.2);
      g.heroX = f.W * 0.25;
      g.heroY = feet - 40 * s;
      g.heroScale = 0.95 * (1 - squash * 0.1);
      g.tilt = onGround ? Math.sin(t * 14) * 0.05 : clamp(vy / (1700 * s), -0.35, 0.45);

      scroll += spd * f.dt;

      /* ── spawn ahead of the camera ────────────────────────────────── */
      let guard = 0;
      while (nextX < scroll + f.W + 140 * s && obs.length < MAX_OBS && guard++ < 8) {
        const dens = lerp(1.85, 1.06, ramp(t, 0, 50));
        const useVent = t > 15 && ventCd <= 0 && rnd() < 0.3;
        if (useVent) {
          const vw = 62 * s;
          obs.push({ wx: nextX, kind: 2, w: vw, h: 130 * s, y: 0, seed: rnd() * 10, hit: false });
          /* the reward trail arcing up out of the steam */
          const apex = ((LL_VENT * LL_VENT) / (2 * LL_G)) * s;
          const ventAir = (2 * LL_VENT) / LL_G;
          for (let i = 0; i < 5; i++) {
            const u = 0.16 + i * 0.17;
            obs.push({
              wx: nextX + u * ventAir * spd,
              kind: 3, w: 0, h: 0,
              y: Math.min(apex * 4 * u * (1 - u) + 40 * s, groundY - 74 * s),
              seed: rnd() * 10, hit: false,
            });
          }
          nextX += ventAir * spd * 1.45;
          ventCd = 3;
        } else {
          const puddle = t > 20 && rnd() < 0.45;
          const w = puddle ? clamp(lerp(0.26, 0.5, ramp(t, 20, 52)) * jd, 40 * s, jd - 2.4 * heroHalf) : 44 * s;
          const h = puddle ? 15 * s : 40 * s;
          obs.push({ wx: nextX, kind: puddle ? 1 : 0, w, h, y: 0, seed: rnd() * 10, hit: false });
          /* eggs: low & free early on, in the jump arc later */
          const lowLine = t < 10;
          const n = lowLine ? 3 : 1 + ((rnd() * 2) | 0);
          for (let i = 0; i < n; i++) {
            obs.push({
              wx: lowLine
                ? nextX + w + jd * (1.12 + i * 0.2)          // on the flat, free points
                : nextX + jd * 0.4 + (i - (n - 1) / 2) * 46 * s,  // up in the jump arc
              kind: 3, w: 0, h: 0,
              y: lowLine ? 36 * s : Math.min((92 + rnd() * 84) * s, groundY - 74 * s),
              seed: rnd() * 10, hit: false,
            });
          }
          nextX += w + jd * dens;
          ventCd -= 1;
        }
      }

      /* ── collide ──────────────────────────────────────────────────── */
      const hwx = scroll + f.W * 0.25;
      for (let i = obs.length - 1; i >= 0; i--) {
        const o = obs[i];
        if (o.wx - scroll < -180 * s) { obs.splice(i, 1); continue; }
        const dx = hwx - o.wx;
        if (o.kind === 3) {
          const ey = groundY - o.y;
          if (Math.hypot(dx, (feet - 40 * s) - ey) < heroR + 22 * s) {
            obs.splice(i, 1);
            api.score(10);
            api.burst(f.W * 0.25 + dx, ey, "#9fe8a0", 12);
            api.pop(f.W * 0.25 + dx, ey - 26 * s, "+10", "#ffffff");
            api.shake(0.1);
            if (airborne) chain++;
          }
          continue;
        }
        if (o.kind === 2) {                       // steam vent — the updraft
          if (Math.abs(dx) < o.w * 0.55 + heroHalf && vy > -LL_VENT * s * 0.55 && feet > groundY - o.h * 0.9) {
            vy = -LL_VENT * s; air = 1;
            api.blip();
            api.burst(f.W * 0.25, feet, "#bff0ff", 26);
            api.pop(f.W * 0.25, feet - 60 * s, "WHOOSH!", "#7ce7ff");
            api.shake(0.3);
          }
          continue;
        }
        if (o.hit) continue;
        if (Math.abs(dx) < o.w * 0.5 + heroR * 0.5 && feet > groundY - o.h * 0.68) {
          o.hit = true;
          chain = 0;
          api.hurt();
          api.burst(f.W * 0.25 + dx, groundY - o.h * 0.5, "#ff8a5c", 20);
          api.pop(f.W * 0.25 + dx, groundY - 70 * s, o.kind === 1 ? "HOT!" : "BONK!", "#ff8a5c");
        }
      }
      if (obs.length > MAX_OBS) obs.splice(0, obs.length - MAX_OBS);
    },

    draw(ctx, f) {
      const s = f.sizeF, groundY = f.floorY - 6 * s;
      for (const o of obs) {
        const x = o.wx - scroll;
        if (x < -140 * s || x > f.W + 160 * s) continue;
        ctx.save();
        if (o.kind === 3) {
          ctx.translate(x, groundY - o.y);
          paintDinoEgg(ctx, 21 * s, f.t, o.seed);
        } else if (o.kind === 2) {
          ctx.translate(x, groundY + 2 * s);
          paintVent(ctx, o.w, o.h, f.t, o.seed);
        } else if (o.kind === 1) {
          ctx.translate(x, groundY - o.h * 0.35);
          paintPuddle(ctx, o.w, o.h, f.t, o.seed);
        } else {
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = "#000";
          ctx.beginPath();
          ctx.ellipse(x, groundY + 5 * s, o.w * 0.6, 6 * s, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          ctx.translate(x, groundY - o.h * 0.48);
          if (o.hit) ctx.globalAlpha = 0.4;
          paintRock(ctx, o.h * 0.6, f.t, o.seed);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    drawFront(ctx, f) {
      const s = f.sizeF;
      /* telegraph what is about to arrive from the right edge */
      for (const o of obs) {
        const x = o.wx - scroll;
        if (o.kind === 3 || x < f.W - 26 * s || x > f.W + 150 * s) continue;
        const k = clamp01((f.W + 150 * s - x) / (176 * s));
        ctx.save();
        ctx.globalAlpha = 0.85 * k;
        ctx.translate(f.W - 20 * s, f.floorY - (o.kind === 2 ? 96 : 44) * s);
        ctx.rotate(Math.PI / 2);
        chevron(ctx, 0, 0, s * 1.4, o.kind === 2 ? "#7ce7ff" : "#ff5a3c", f.t + o.seed);
        ctx.restore();
      }
      /* air chain readout */
      if (chain >= 2) {
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.font = `900 ${Math.round(15 * s) + 8}px 'Baloo 2', sans-serif`;
        ctx.textAlign = "center";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(3, 4 * s);
        ctx.strokeStyle = "rgba(36,26,32,0.9)";
        const label = `AIR ×${chain}`;
        ctx.strokeText(label, g.heroX, g.heroY - 62 * s);
        ctx.fillStyle = "#7ce7ff";
        ctx.fillText(label, g.heroX, g.heroY - 62 * s);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  };
  return g;
}

/* ══ DINO 2 · Meteor Dodge ═══════════════════════════════════════════════
   The mirror of Egg Catch: hazards are dense, pickups are rare, and the
   VERB is dodging. Mechanic: the closer a star-rock misses you, the bigger
   the WHOOSH bonus — so you lean into danger on purpose.                 */

interface Rock {
  x: number; y: number; vy: number; r: number; good: boolean; seed: number;
  minD: number; graded: boolean;
}
interface Fire { x: number; t0: number; r: number; burned: boolean }
const MAX_ROCKS = 26;

function meteorDodge(): GameInstance {
  let hx = 0.5, spawnT = 0.9, eggT = 3.2;
  const rocks: Rock[] = [];
  const fires: Fire[] = [];
  const rings: { x: number; t0: number }[] = [];

  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 0.95,
    hint: "Dodge CLOSE for big WHOOSH points — but don't get bonked!",

    update(f, inp, api) {
      if (f.W < 8 || f.H < 8) return;
      const s = f.sizeF, t = f.t;
      hx += (inp.x - hx) * damp(f.dt, 12);
      hx = clamp(hx, 0.06, 0.94);
      g.heroX = hx * f.W;
      g.heroY = f.floorY - 36 * s;
      g.tilt = clamp((inp.x - hx) * 1.0, -0.4, 0.4);
      const heroR = 40 * s;

      /* ── spawning, with a guaranteed escape corridor ───────────────── */
      const fallV = lerp(0.40, 0.92, ramp(t, 0, 52));
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const group = t < 20 ? 1 : t < 40 ? (rnd() < 0.5 ? 2 : 1) : rnd() < 0.45 ? 3 : 2;
        /* how much clear ground is left? never fill the last corridor */
        const spans: [number, number][] = [];
        for (const r of rocks) if (!r.good && r.y < 0.72) spans.push([r.x - 0.11, r.x + 0.11]);
        for (const fi of fires) spans.push([fi.x - 0.1, fi.x + 0.1]);
        spans.sort((a, b) => a[0] - b[0]);
        let free = 0, cur = 0.05;
        for (const sp of spans) {
          free = Math.max(free, sp[0] - cur);
          cur = Math.max(cur, sp[1]);
        }
        free = Math.max(free, 0.95 - cur);
        if (free > 0.24) {
          const placed: number[] = [];
          for (let i = 0; i < group && rocks.length < MAX_ROCKS; i++) {
            let x = -1;
            for (let tries = 0; tries < 8; tries++) {
              const c = 0.08 + rnd() * 0.84;
              if (Math.abs(c - hx) < 0.14) continue;                 // never on the player
              if (placed.some((p) => Math.abs(p - c) < 0.19)) continue;
              x = c; break;
            }
            if (x < 0) break;
            placed.push(x);
            rocks.push({
              x, y: -0.14 - i * 0.05, vy: fallV * (0.9 + rnd() * 0.25),
              r: 24, good: false, seed: rnd() * 10, minD: 99, graded: false,
            });
          }
        }
        spawnT = lerp(1.15, 0.42, ramp(t, 0, 50)) * (0.85 + rnd() * 0.3);
      }
      /* the rare, tempting pickup */
      eggT -= f.dt;
      if (eggT <= 0 && rocks.length < MAX_ROCKS) {
        rocks.push({
          x: 0.1 + rnd() * 0.8, y: -0.1, vy: fallV * 0.62,
          r: 21, good: true, seed: rnd() * 10, minD: 99, graded: true,
        });
        eggT = 3.6 + rnd() * 2.2;
      }

      /* ── move, graze-grade, collide ────────────────────────────────── */
      for (let i = rocks.length - 1; i >= 0; i--) {
        const e = rocks[i];
        e.y += e.vy * f.dt;
        const ex = e.x * f.W, ey = e.y * f.H, er = e.r * s;
        const d = Math.hypot(ex - g.heroX, ey - g.heroY);
        const unit = heroR + er;
        if (!e.graded && ey > g.heroY - unit * 3.2) e.minD = Math.min(e.minD, d / unit);

        if (d < heroR * 0.74 + er * 0.68) {
          rocks.splice(i, 1);
          if (e.good) {
            api.score(20);
            api.burst(ex, ey, "#9fe8a0", 24);
            api.pop(ex, ey - 34 * s, "EGG! +20", "#9fe8a0");
            api.shake(0.28);
          } else {
            api.hurt();
            api.burst(ex, ey, "#ff8a5c", 22);
            api.pop(ex, ey - 34 * s, "BONK!", "#ff8a5c");
          }
          continue;
        }
        /* graded the moment it is safely past — the cull line is just below */
        if (!e.graded && ey > g.heroY + unit * 0.5) {
          e.graded = true;
          if (e.minD < 1.55) {
            api.score(15);
            api.burst(ex, ey - unit, "#7ce7ff", 18);
            api.pop(g.heroX, g.heroY - 66 * s, "WHOOSH!", "#7ce7ff");
            api.shake(0.22);
          } else if (e.minD < 2.5) {
            api.score(5);
            api.pop(ex, ey - 30 * s, "+5", "#ffffff");
          }
        }
        if (ey > f.floorY + 6 * s) {
          rocks.splice(i, 1);
          if (!e.good && !e.graded && e.minD < 2.5) api.score(5);
          if (!e.good) {
            rings.push({ x: ex, t0: t });
            if (rings.length > 8) rings.shift();
            api.shake(0.12);
            /* late round: impacts leave a fire patch you must walk around */
            if (t > 36 && fires.length < 4) fires.push({ x: e.x, t0: t, r: 34 * s, burned: false });
          }
        }
      }
      for (let i = fires.length - 1; i >= 0; i--) {
        const fi = fires[i];
        const age = t - fi.t0;
        if (age > 2.8) { fires.splice(i, 1); continue; }
        if (!fi.burned && age > 0.45 && age < 2.3 && Math.abs(fi.x * f.W - g.heroX) < fi.r * 0.75) {
          fi.burned = true;
          api.hurt();
          api.pop(fi.x * f.W, f.floorY - 50 * s, "HOT!", "#ff8a5c");
        }
      }
      for (let i = rings.length - 1; i >= 0; i--) if (t - rings[i].t0 > 0.55) rings.splice(i, 1);
      if (rocks.length > MAX_ROCKS) rocks.splice(0, rocks.length - MAX_ROCKS);
    },

    draw(ctx, f) {
      const s = f.sizeF;
      /* fire patches sit on the ground, behind everything */
      for (const fi of fires) {
        const age = f.t - fi.t0;
        const k = age < 0.45 ? age / 0.45 : age > 2.3 ? clamp01((2.8 - age) / 0.5) : 1;
        ctx.save();
        ctx.globalAlpha = 0.85 * k;
        ctx.translate(fi.x * f.W, f.floorY + 2 * s);
        const gd = ctx.createRadialGradient(0, 0, 2, 0, 0, fi.r);
        gd.addColorStop(0, "rgba(255,220,120,0.95)");
        gd.addColorStop(1, "rgba(255,90,40,0)");
        ctx.fillStyle = gd;
        ctx.beginPath();
        ctx.ellipse(0, 0, fi.r, fi.r * 0.4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#ffb347";
        for (let i = 0; i < 5; i++) {
          const fx = (-0.6 + i * 0.3) * fi.r;
          const fh = fi.r * (0.5 + 0.35 * Math.abs(Math.sin(f.t * 7 + i * 1.7 + fi.t0)));
          ctx.beginPath();
          ctx.moveTo(fx - fi.r * 0.11, 0);
          ctx.quadraticCurveTo(fx, -fh, fx + fi.r * 0.11, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      /* impact rings */
      for (const r of rings) {
        const p = clamp01((f.t - r.t0) / 0.55);
        ctx.save();
        ctx.globalAlpha = (1 - p) * 0.8;
        ctx.strokeStyle = "#ffb347";
        ctx.lineWidth = 4 * s * (1 - p);
        ctx.beginPath();
        ctx.ellipse(r.x, f.floorY, (10 + p * 60) * s, (4 + p * 22) * s, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      /* the falling things */
      for (const e of rocks) {
        const ex = e.x * f.W, ey = e.y * f.H, er = e.r * s;
        if (!e.good) {
          const near = clamp(ey / Math.max(1, f.floorY), 0.12, 1);
          ctx.save();
          ctx.globalAlpha = 0.34 * near;
          ctx.fillStyle = "#ff5a3c";
          ctx.beginPath();
          ctx.ellipse(ex, f.floorY + 5 * s, er * (0.5 + near * 0.9), 7 * s * near, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        if (e.y < -0.05) continue;
        ctx.save();
        ctx.translate(ex, ey);
        if (e.good) paintDinoEgg(ctx, er, f.t, e.seed);
        else {
          ctx.save();
          ctx.globalAlpha = 0.75;
          const tr = ctx.createLinearGradient(0, -er * 2.6, 0, 0);
          tr.addColorStop(0, "rgba(255,150,60,0)");
          tr.addColorStop(1, "rgba(255,190,90,0.9)");
          ctx.fillStyle = tr;
          ctx.beginPath();
          ctx.moveTo(-er * 0.55, 0);
          ctx.quadraticCurveTo(0, -er * 2.8, er * 0.55, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.rotate(f.t * 2.4 + e.seed);
          paintRock(ctx, er, f.t, e.seed);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    drawFront(ctx, f) {
      const s = f.sizeF;
      let nearest = 9;
      for (const e of rocks) {
        if (e.good) continue;
        if (e.y < -0.01) {
          chevron(ctx, e.x * f.W, 40 * s, s * 1.5, "#ff5a3c", f.t + e.seed);
        } else {
          const d = Math.hypot(e.x * f.W - g.heroX, e.y * f.H - g.heroY) / (40 * s + e.r * s);
          if (e.y * f.H < g.heroY) nearest = Math.min(nearest, d);
        }
      }
      /* the graze ring blooms as a rock closes in — teaches the mechanic */
      if (nearest < 3.4) {
        const k = clamp01((3.4 - nearest) / 2.2);
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.5 * k;
        ctx.strokeStyle = nearest < 1.55 ? "#7ce7ff" : "#ffffff";
        ctx.lineWidth = (2 + 2.5 * k) * s;
        ctx.setLineDash([8 * s, 7 * s]);
        ctx.beginPath();
        ctx.arc(g.heroX, g.heroY, (40 + 24) * s * 1.55, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    },
  };
  return g;
}

/* ══ DINO 3 · Cliff Hopper ═══════════════════════════════════════════════
   Hold to fill the meter (it fills and HOLDS at max — no ping-pong), let go
   to leap; a dotted arc and a landing X show exactly where you'll come down.
   Every gap is generated from the jump equation, so a max charge always
   overshoots it — nothing is ever unreachable. Mechanic: the glowing
   BULLSEYE in each ledge centre pays PERFECT.                            */

const CH_G = 1450, CH_FILL = 1.15;
const chVX = (p: number) => 250 + 210 * p;
const chVY = (p: number) => -(470 + 200 * p);
/** Horizontal distance a charge of `p` covers when the landing is `dy` px lower. */
function chReach(p: number, dy: number, s: number) {
  const vx = chVX(p) * s, vy = chVY(p) * s, gg = CH_G * s;
  const disc = vy * vy + 2 * gg * dy;
  if (disc <= 0) return -1;
  return (vx * (-vy + Math.sqrt(disc))) / gg;
}

interface Ledge {
  wx: number; baseY: number; w: number; bob: number; phase: number;
  crumbly: boolean; crumbleAt: number; fall: number; seed: number; used: boolean;
}
const MAX_LEDGES = 8;

function cliffHopper(): GameInstance {
  const ledges: Ledge[] = [];
  let cur = 0;                     // index of the ledge we're standing on
  let mode: "aim" | "fly" = "aim";
  let chg = 0, wasDown = false;
  let pwx = 0, py = 0, vx = 0, vy = 0, prevPy = 0, prevPwx = 0;
  let cam = 0, ready = false, landT = -9;

  const topY = (l: Ledge, t: number) => l.baseY + Math.sin(t * 1.05 + l.phase) * l.bob + l.fall;

  const addLedge = (f: Frame, t: number) => {
    const s = f.sizeF, from = ledges[ledges.length - 1];
    const w = lerp(150, 96, ramp(t, 6, 46)) * s;
    const lo = f.H * 0.32, hi = f.floorY - 34 * s;
    const spread = (26 + 52 * ramp(t, 0, 34)) * s;
    const baseY = clamp(from.baseY + (rnd() * 2 - 1) * spread, lo, hi);
    const dy = baseY - from.baseY;
    /* aim for a gap a mid charge covers, then clamp it into the reachable band */
    let gap = f.W * lerp(0.30, 0.45, ramp(t, 4, 48)) * (0.86 + rnd() * 0.28);
    gap = Math.min(gap, f.W * 0.55);
    const far = chReach(0.86, dy, s);
    if (far > 0) gap = Math.min(gap, far * 0.94);
    const near = chReach(0.14, dy, s);
    if (near > 0) gap = Math.max(gap, near * 1.06);
    ledges.push({
      wx: from.wx + gap, baseY, w,
      bob: t > 20 && rnd() < 0.45 ? 15 * s : 0,
      phase: rnd() * 10,
      crumbly: t > 40 && rnd() < 0.4,
      crumbleAt: 0, fall: 0, seed: rnd() * 10, used: false,
    });
    while (ledges.length > MAX_LEDGES) { ledges.shift(); cur = Math.max(0, cur - 1); }
  };

  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 0.86,
    hint: "HOLD to charge, LET GO to jump — land on the glowing bullseye!",

    update(f, inp, api) {
      if (f.W < 8 || f.H < 8) return;
      const s = f.sizeF, t = f.t;
      if (!ready) {
        ledges.length = 0;
        ledges.push({
          wx: 0, baseY: clamp(f.floorY - 96 * s, f.H * 0.32, f.floorY - 34 * s),
          w: 150 * s, bob: 0, phase: 0, crumbly: false, crumbleAt: 0, fall: 0, seed: 1, used: true,
        });
        for (let i = 0; i < 4; i++) addLedge(f, 0);
        cur = 0;
        pwx = ledges[0].wx; py = topY(ledges[0], t);
        cam = pwx - f.W * 0.28;
        ready = true;
      }

      /* ── charge (held state read straight from the pointer) ────────── */
      const down = inp.down;
      if (mode === "aim") {
        if (down) chg = Math.min(1, chg + f.dt / CH_FILL);
        if (wasDown && !down && chg > 0.04) {
          vx = chVX(chg) * s; vy = chVY(chg) * s;
          mode = "fly";
          api.blip();
          api.burst(pwx - cam, py, "#c9a87e", 12);
          chg = 0;
        } else if (!down) chg = 0;
      }
      wasDown = down;

      /* ── crumbling ledges ─────────────────────────────────────────── */
      for (const l of ledges) {
        if (l.crumbleAt > 0 && t > l.crumbleAt) l.fall += 420 * s * f.dt;
      }

      const base = ledges[cur];
      if (mode === "aim") {
        pwx = base.wx;
        py = topY(base, t);
        if (base.fall > 12 * s) { mode = "fly"; vx = 0; vy = 0; }   // the ledge gave way
        g.tilt = down ? Math.sin(t * 16) * 0.06 : Math.sin(t * 2) * 0.04;
      } else {
        prevPy = py; prevPwx = pwx;
        vy += CH_G * s * f.dt;
        pwx += vx * f.dt; py += vy * f.dt;
        g.tilt = clamp(Math.atan2(vy, Math.max(1, vx * 2)), -0.4, 0.5);
        if (vy > 0) {
          for (let i = cur + 1; i < ledges.length; i++) {
            const l = ledges[i];
            if (l.fall > 12 * s) continue;
            const top = topY(l, t);
            if (!(prevPy <= top && py >= top)) continue;
            const u = clamp01((top - prevPy) / Math.max(0.001, py - prevPy));
            const xAt = lerp(prevPwx, pwx, u);
            const off = Math.abs(xAt - l.wx) / (l.w * 0.5);
            const rescue = 1 + (26 * s) / (l.w * 0.5);
            if (off > rescue) continue;
            /* landed! */
            cur = i; landT = t; l.used = true;
            pwx = clamp(xAt, l.wx - l.w * 0.44, l.wx + l.w * 0.44);
            py = top; vy = 0; vx = 0; mode = "aim"; chg = 0;
            if (l.crumbly && l.crumbleAt === 0) l.crumbleAt = t + 2.2;
            const sx = pwx - cam;
            if (off < 0.34) {
              api.score(25);
              api.pop(sx, py - 96 * s, "PERFECT!", "#ffd233");
              api.burst(sx, py - 20 * s, "#ffd233", 30);
              api.shake(0.45);
            } else if (off > 1) {
              api.score(8);
              api.pop(sx, py - 96 * s, "PHEW!", "#7ce7ff");
              api.burst(sx, py, "#c9a87e", 14);
              api.shake(0.2);
            } else {
              api.score(10);
              api.pop(sx, py - 96 * s, "+10", "#ffffff");
              api.burst(sx, py, "#c9a87e", 14);
              api.shake(0.16);
            }
            while (ledges.length - cur < 5) addLedge(f, t);
            break;
          }
        }
        /* a soft landing in the ferns below — never a scary fall */
        if (mode === "fly" && py > f.floorY + 26 * s) {
          api.hurt();
          api.burst(clamp(pwx - cam, 20, f.W - 20), f.floorY + 10 * s, "#7bc96f", 22);
          api.pop(clamp(pwx - cam, 40, f.W - 40), f.floorY - 26 * s, "hop back up!", "#9fe8a0");
          const l = ledges[cur];
          l.crumbly = false; l.crumbleAt = 0; l.fall = 0;
          pwx = l.wx; py = topY(l, t); vx = 0; vy = 0;
          mode = "aim"; chg = 0; wasDown = down;
        }
      }

      /* camera: keep the launch pad at 28% and never scroll backwards */
      const want = mode === "aim"
        ? ledges[cur].wx - f.W * 0.28
        : Math.max(ledges[cur].wx - f.W * 0.28, pwx - f.W * 0.42);
      cam += (want - cam) * damp(f.dt, 7);
      while (ledges.length - cur < 5) addLedge(f, t);

      const squash = Math.max(0, 1 - (t - landT) / 0.22);
      g.heroX = pwx - cam;
      g.heroY = py - 38 * s;
      g.heroScale = 0.86 * (1 - squash * 0.1) * (mode === "aim" && inp.down ? 1 - chg * 0.06 : 1);
    },

    draw(ctx, f) {
      const s = f.sizeF;
      for (const l of ledges) {
        const x = l.wx - cam, y = topY(l, f.t);
        if (x < -l.w || x > f.W + l.w) continue;
        ctx.save();
        ctx.translate(x, y);
        if (l.fall > 0) ctx.rotate(clamp(l.fall / (200 * s), 0, 0.4));
        /* slab */
        ctx.beginPath();
        ctx.moveTo(-l.w / 2, 0);
        ctx.lineTo(l.w / 2, 0);
        ctx.lineTo(l.w * 0.34, 30 * s);
        ctx.lineTo(-l.w * 0.32, 34 * s);
        ctx.closePath();
        ctx.fillStyle = "#4a3a2c";
        ctx.fill();
        inkStroke(ctx, 3 * s, "#2a2018");
        /* mossy top */
        ctx.beginPath();
        ctx.ellipse(0, 0, l.w / 2, 9 * s, 0, 0, TAU);
        ctx.fillStyle = l.crumbly ? "#8a6a4a" : "#6f8f4a";
        ctx.fill();
        inkStroke(ctx, 2.6 * s, "#2a2018");
        /* bullseye: the perfect-landing zone */
        const shine = 0.45 + 0.3 * Math.sin(f.t * 4 + l.seed);
        ctx.save();
        ctx.globalAlpha = l.used ? shine * 0.35 : shine;
        ctx.fillStyle = "#ffd233";
        ctx.beginPath();
        ctx.ellipse(0, 0, l.w * 0.17, 6 * s, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "#fff3b0";
        ctx.lineWidth = 2.4 * s;
        ctx.beginPath();
        ctx.ellipse(0, 0, l.w * 0.3, 9 * s, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
        /* cracks warn you this one is going to go */
        if (l.crumbly) {
          ctx.strokeStyle = "rgba(30,20,14,0.8)";
          ctx.lineWidth = 2.4 * s;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * l.w * 0.24, 2 * s);
            ctx.lineTo(i * l.w * 0.24 + 6 * s, 16 * s);
            ctx.lineTo(i * l.w * 0.24 - 3 * s, 30 * s);
            ctx.stroke();
          }
          if (l.crumbleAt > 0) {
            ctx.save();
            ctx.globalAlpha = 0.5 + 0.4 * Math.sin(f.t * 22);
            ctx.fillStyle = "#ff8a5c";
            ctx.beginPath();
            ctx.ellipse(0, -14 * s, l.w * 0.2, 5 * s, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
          }
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    drawFront(ctx, f) {
      const s = f.sizeF;
      if (mode !== "aim" || chg <= 0.02) { ctx.globalAlpha = 1; return; }
      const p = chg;
      /* dotted arc preview + the landing X */
      let ax = pwx, ay = py, avy = chVY(p) * s;
      const avx = chVX(p) * s;
      const step = 0.055;
      let hitX = ax, hitY = ay;
      ctx.save();
      ctx.fillStyle = "#fff3b0";
      for (let i = 0; i < 26; i++) {
        avy += CH_G * s * step;
        ax += avx * step; ay += avy * step;
        if (ay > f.floorY + 20 * s) break;
        hitX = ax; hitY = ay;
        ctx.globalAlpha = 0.9 - i * 0.03;
        ctx.beginPath();
        ctx.arc(ax - cam, ay, 3.4 * s, 0, TAU);
        ctx.fill();
        /* stop the arc at the first ledge it would touch */
        let stop = false;
        for (let li = cur + 1; li < ledges.length; li++) {
          const l = ledges[li];
          if (l.fall > 12 * s) continue;
          const top = topY(l, f.t);
          if (avy > 0 && ay >= top && ay < top + 26 * s && Math.abs(ax - l.wx) < l.w * 0.6) { stop = true; break; }
        }
        if (stop) break;
      }
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4 * s;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(hitX - cam - 9 * s, hitY - 9 * s);
      ctx.lineTo(hitX - cam + 9 * s, hitY + 9 * s);
      ctx.moveTo(hitX - cam + 9 * s, hitY - 9 * s);
      ctx.lineTo(hitX - cam - 9 * s, hitY + 9 * s);
      ctx.stroke();
      ctx.restore();

      /* power bar over the hero */
      const bw = 92 * s, bh = 16 * s;
      ctx.save();
      ctx.translate(g.heroX, py - 104 * s);
      ctx.beginPath();
      ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
      ctx.fillStyle = "rgba(20,14,26,0.65)";
      ctx.fill();
      inkStroke(ctx, 2.6 * s, "rgba(255,255,255,0.5)");
      const gd = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
      gd.addColorStop(0, "#3aae3a");
      gd.addColorStop(0.55, "#ffd233");
      gd.addColorStop(1, "#ff5a3c");
      ctx.beginPath();
      ctx.roundRect(-bw / 2 + 2.5 * s, -bh / 2 + 2.5 * s, Math.max(1, (bw - 5 * s) * p), bh - 5 * s, (bh - 5 * s) / 2);
      ctx.fillStyle = gd;
      ctx.fill();
      if (p >= 0.999) {
        ctx.globalAlpha = 0.4 + 0.4 * Math.sin(f.t * 18);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.roundRect(-bw / 2 + 2.5 * s, -bh / 2 + 2.5 * s, bw - 5 * s, bh - 5 * s, (bh - 5 * s) / 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  };
  return g;
}

/* ── factory ────────────────────────────────────────────────────────────── */

export function dinoGame(id: string): GameInstance | null {
  switch (id) {
    case "lavaLeap": return lavaLeap();
    case "meteorDodge": return meteorDodge();
    case "cliffHopper": return cliffHopper();
    default: return null;
  }
}
