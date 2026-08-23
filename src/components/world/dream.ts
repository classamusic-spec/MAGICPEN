// ─── Dream World: the child's own painted world, brought to life ─────────────
// The other worlds are hand-authored procedural scenes. This one is whatever
// the child drew — so it cannot know that *this* stroke is water and *that* one
// is the sun. It does two things instead:
//
//   • gives the whole drawing a gentle "breathe", the same trick the creature
//     sprites use, so a static page reads as alive;
//   • runs two cheap heuristics — a warm blob up high is a sun, cool strokes
//     down low are water — and adds a glow and a shimmer only where it is
//     confident, so the two most recognisable things behave like themselves.
//
// Everything is baked once per drawing and composited each frame, so the cost
// is a handful of fills and one drawImage no matter how much the child drew.

import type { DreamWorld } from "@/lib/types";
import { drawCrayonStroke } from "@/lib/crayon";
import { slot, vignette, type FxState, type ThemeFrame } from "./shared";

/* ── colour helpers ────────────────────────────────────────────────────────── */

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const isWarm = ([r, g, b]: [number, number, number]) => r > 175 && g > 105 && b < 150 && r >= g - 10;
const isCool = ([r, g, b]: [number, number, number]) => b > r + 18 || (g > 150 && b > 150 && r < 130);

/* ── what got baked, cached per drawing revision ───────────────────────────── */

interface Baked {
  cv: HTMLCanvasElement;
  ss: number;
  /** Sun, in drawn-canvas coords, or null when there isn't a warm blob up top. */
  sun: { x: number; y: number } | null;
  /** Top of the water band in drawn-canvas coords, or null. */
  waterTop: number | null;
}

function bake(dream: DreamWorld): Baked {
  const ss = 2; // supersample so the crayon stays crisp when scaled up
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(dream.dw * ss));
  cv.height = Math.max(1, Math.round(dream.dh * ss));
  const ctx = cv.getContext("2d")!;
  ctx.scale(ss, ss);
  dream.strokes.forEach((s, i) => drawCrayonStroke(ctx, s.pts, s.color, s.size, i + 1));

  // heuristics: a warm cluster in the top 45% is the sun; cool ink in the
  // bottom 55% is water. Both are deliberately shy — they stay off unless the
  // child clearly drew the thing.
  let sx = 0, sy = 0, sn = 0;
  let waterTop = Infinity, wn = 0;
  for (const s of dream.strokes) {
    const col = rgb(s.color);
    const warm = isWarm(col);
    const cool = isCool(col);
    for (let k = 0; k < s.pts.length; k += 3) {
      const p = s.pts[k];
      if (warm && p.y < dream.dh * 0.45) { sx += p.x; sy += p.y; sn++; }
      if (cool && p.y > dream.dh * 0.5) { waterTop = Math.min(waterTop, p.y); wn++; }
    }
  }
  return {
    cv,
    ss,
    sun: sn > 8 ? { x: sx / sn, y: sy / sn } : null,
    waterTop: wn > 10 ? waterTop : null,
  };
}

/* ── drifting motes: dust in the air, bubbles in the water ─────────────────── */

interface Mote { x: number; y: number; r: number; sp: number; ph: number }

function motes(fx: FxState): Mote[] {
  return slot(fx, "dream.motes", () => {
    const out: Mote[] = [];
    // deterministic scatter — no Math.random in a render module's init path
    let seed = 1234;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 16; i++) out.push({ x: rnd(), y: rnd(), r: 1.2 + rnd() * 2.4, sp: 0.01 + rnd() * 0.03, ph: rnd() * 6.28 });
    return out;
  });
}

/* ── the frame ─────────────────────────────────────────────────────────────── */

export function drawDream({ ctx, W, H, t, floorY }: ThemeFrame, fx: FxState, dt: number, dream: DreamWorld | null) {
  if (!(W > 1) || !(H > 1)) return;

  // ── base wash: soft sky above the ground, soft earth below, so any part of
  //    the world the child left blank still reads as a place, not a gap ──
  const sky = ctx.createLinearGradient(0, 0, 0, floorY);
  sky.addColorStop(0, "#eaf1ff");
  sky.addColorStop(1, "#f4eeff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, floorY);
  const earth = ctx.createLinearGradient(0, floorY, 0, H);
  earth.addColorStop(0, "#efe6d3");
  earth.addColorStop(1, "#e6d9be");
  ctx.fillStyle = earth;
  ctx.fillRect(0, floorY, W, H - floorY);

  if (!dream) { vignette(ctx, W, H, 0.16); return; }

  const baked = slot(fx, `dream.bake.${dream.rev}`, () => bake(dream));

  // fill the width; anchor the drawn ground to where creatures walk
  const s = W / dream.dw;
  const oy = floorY - dream.ground * dream.dh * s;

  // ── the drawing, breathing: a tiny scale about the ground line so the top
  //    of the world lifts and settles while the ground stays put ──
  const breathe = 1 + Math.sin(t * 0.6) * 0.005;
  ctx.save();
  ctx.translate(W / 2, floorY);
  ctx.scale(breathe, breathe);
  ctx.translate(-W / 2, -floorY);
  ctx.drawImage(baked.cv, 0, 0, baked.cv.width, baked.cv.height, 0, oy, dream.dw * s, dream.dh * s);
  ctx.restore();

  // ── sun glow, only if the child drew one ──
  if (baked.sun) {
    const sxp = baked.sun.x * s;
    const syp = oy + baked.sun.y * s;
    const pulse = 0.6 + Math.sin(t * 1.3) * 0.12;
    const R = Math.min(W, H) * 0.34;
    const g = ctx.createRadialGradient(sxp, syp, 0, sxp, syp, R);
    g.addColorStop(0, `rgba(255,214,92,${0.42 * pulse})`);
    g.addColorStop(0.5, `rgba(255,190,60,${0.16 * pulse})`);
    g.addColorStop(1, "rgba(255,190,60,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sxp, syp, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── water shimmer, only if the child drew some ──
  if (baked.waterTop != null) {
    const top = oy + baked.waterTop * s;
    const band = Math.max(0, floorY - top);
    if (band > 6) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, W, band);
      ctx.clip();
      // a soft aqua tint that says "this is under water"
      ctx.fillStyle = "rgba(90,200,220,0.10)";
      ctx.fillRect(0, top, W, band);
      // drifting caustic lines
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const y = top + (band * (i + 0.5)) / 4;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 12) {
          const yy = y + Math.sin(x * 0.03 + t * 1.4 + i) * 3;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── ambient motes: dust drifting, bubbles rising in the water ──
  const water = baked.waterTop != null ? oy + baked.waterTop * s : H;
  ctx.save();
  for (const m of motes(fx)) {
    m.ph += dt * (0.6 + m.sp * 8);
    const px = ((m.x + Math.sin(m.ph) * 0.02) % 1) * W;
    let py: number;
    if (m.y * H > water) {
      // in the water: rise like a bubble, wrap to the surface
      m.y -= m.sp * dt * 0.9;
      if (m.y * H < water) m.y = H / H; // back to the floor area
      py = m.y * H;
      ctx.strokeStyle = `rgba(160,215,235,0.5)`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(px, py, m.r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // in the air: drift slowly, wrap around
      m.y += Math.sin(m.ph) * 0.0006;
      py = m.y * H;
      ctx.fillStyle = `rgba(255,255,255,0.5)`;
      ctx.beginPath();
      ctx.arc(px, py, m.r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // ── a top-down highlight and a vignette for depth ──
  const hi = ctx.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, H * 0.9);
  hi.addColorStop(0, "rgba(255,255,255,0.18)");
  hi.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hi;
  ctx.fillRect(0, 0, W, H);
  vignette(ctx, W, H, 0.18);
}
