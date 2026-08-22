// ─── Game juice: particles, floating score text, screen shake & combos ──────
// Owned by the MiniGame shell. Games reach it through the GameAPI so every
// game gets the same feedback language for free.

import { clamp01, easeOut } from "./core";

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; r: number; color: string;
  spin: number; rot: number; kind: 0 | 1; // 0 = spark, 1 = confetti ribbon
}

interface FloatText {
  x: number; y: number; text: string; color: string;
  life: number; max: number; scale: number;
}

const PALETTE = ["#ffd65a", "#fb66e5", "#00c2b9", "#ff8a5c", "#8b46c7", "#ffffff"];

export class Juice {
  private parts: Particle[] = [];
  private texts: FloatText[] = [];
  private shakeAmt = 0;
  private shakeT = 0;
  private comboN = 1;
  private comboT = 0;
  /** Rises on every score, decays over ~2.2s — read by the HUD. */
  comboWindow = 0;

  reset() {
    this.parts.length = 0;
    this.texts.length = 0;
    this.shakeAmt = 0;
    this.comboN = 1;
    this.comboT = 0;
    this.comboWindow = 0;
  }

  /* ── emitters ─────────────────────────────────────────────────────────── */

  burst(x: number, y: number, color?: string, count = 14) {
    const n = Math.min(46, count);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 70 + Math.random() * 220;
      const confetti = i % 3 === 0;
      this.parts.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        life: 0.55 + Math.random() * 0.5,
        max: 1,
        r: (confetti ? 5 : 3) + Math.random() * 3,
        color: color ?? PALETTE[(Math.random() * PALETTE.length) | 0],
        spin: (Math.random() - 0.5) * 14,
        rot: Math.random() * 6.28,
        kind: confetti ? 1 : 0,
      });
    }
    // normalise `max` so each particle fades over its own lifetime
    for (let i = this.parts.length - n; i < this.parts.length; i++) this.parts[i].max = this.parts[i].life;
  }

  /** A directional puff — dust on landing, spray on a splash. */
  puff(x: number, y: number, dirX: number, color = "rgba(255,255,255,0.85)", count = 10) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI - Math.PI / 2;
      const v = 40 + Math.random() * 120;
      const life = 0.3 + Math.random() * 0.35;
      this.parts.push({
        x, y,
        vx: Math.cos(a) * v * dirX,
        vy: -Math.abs(Math.sin(a)) * v * 0.7,
        life, max: life,
        r: 2 + Math.random() * 4,
        color,
        spin: 0, rot: 0, kind: 0,
      });
    }
  }

  pop(x: number, y: number, text: string, color = "#ffd65a") {
    this.texts.push({ x, y, text, color, life: 0.95, max: 0.95, scale: 1 });
    if (this.texts.length > 14) this.texts.shift();
  }

  shake(amount: number) {
    this.shakeAmt = Math.min(1, Math.max(this.shakeAmt, amount));
  }

  /* ── combo ────────────────────────────────────────────────────────────── */

  /** Register a scoring hit; returns the multiplier that should be applied. */
  hit(): number {
    this.comboT = 2.2;
    this.comboN = Math.min(9, this.comboN + 1);
    this.comboWindow = 1;
    return this.multiplier();
  }

  /** 1× for the first few hits, then ramps: 3 hits = 2×, 6 hits = 3×. */
  multiplier(): number {
    return 1 + Math.floor((this.comboN - 1) / 3);
  }

  comboCount(): number { return this.comboN - 1; }

  breakCombo() {
    this.comboN = 1;
    this.comboT = 0;
    this.comboWindow = 0;
  }

  /* ── frame ────────────────────────────────────────────────────────────── */

  update(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += 520 * dt;          // gravity
      p.vx *= 1 - Math.min(1, 1.6 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const f = this.texts[i];
      f.life -= dt;
      if (f.life <= 0) { this.texts.splice(i, 1); continue; }
      f.y -= 58 * dt;
    }
    if (this.shakeAmt > 0) {
      this.shakeT += dt;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.6);
    }
    if (this.comboT > 0) {
      this.comboT -= dt;
      this.comboWindow = clamp01(this.comboT / 2.2);
      if (this.comboT <= 0) this.breakCombo();
    }
  }

  /** Apply screen shake to the current transform (call before world drawing). */
  applyShake(ctx: CanvasRenderingContext2D, sizeF: number) {
    if (this.shakeAmt <= 0.001) return;
    const a = this.shakeAmt * this.shakeAmt * 16 * sizeF;
    ctx.translate(
      Math.sin(this.shakeT * 61) * a,
      Math.cos(this.shakeT * 47) * a * 0.8,
    );
  }

  /** Particles + floating text, drawn above everything the game painted. */
  draw(ctx: CanvasRenderingContext2D, sizeF: number) {
    for (const p of this.parts) {
      const k = clamp01(p.life / p.max);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.kind === 1) {
        const w = p.r * 2.2 * sizeF;
        const h = p.r * 0.9 * sizeF * (0.4 + 0.6 * Math.abs(Math.cos(p.rot * 2)));
        ctx.fillRect(-w / 2, -h / 2, w, h);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.r * k * sizeF, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const f of this.texts) {
      const u = 1 - f.life / f.max;
      const k = easeOut(Math.min(1, u * 4));
      const fade = clamp01(f.life / (f.max * 0.5));
      const size = Math.round((20 + 10 * k) * sizeF) + 6;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.font = `900 ${size}px 'Baloo 2', sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = Math.max(3, size * 0.16);
      ctx.strokeStyle = "rgba(45,41,38,0.85)";
      ctx.lineJoin = "round";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }
}
