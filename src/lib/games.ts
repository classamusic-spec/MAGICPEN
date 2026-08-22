// ─── Mini-game engines: 12 games, 3 per world ───────────────────────────────
// Each game positions the hero (the kid's own creature) and draws its entities;
// the shell handles background, HUD, hearts, timer and the hero sprite itself.

export interface GameMeta { id: string; title: string; emoji: string; how: string }

export const WORLD_GAMES: Record<string, GameMeta[]> = {
  ocean: [
    { id: "bubbleGulp", title: "Bubble Gulp", emoji: "🫧", how: "HOLD to float up · let go to sink · gulp the food, dodge the jellies!" },
    { id: "coralGlide", title: "Coral Glide", emoji: "🪸", how: "TAP to flap upward · slip through the coral gates!" },
    { id: "crabTap", title: "Crab Tap", emoji: "🦀", how: "TAP the crabs when they pop out · leave the pufferfish alone!" },
  ],
  space: [
    { id: "starRush", title: "Star Rush", emoji: "⭐", how: "DRAG to steer · catch the stars, dodge the asteroids!" },
    { id: "astroLanes", title: "Astro Lanes", emoji: "🛸", how: "TAP high or low to switch lanes · stars good, rocks bad!" },
    { id: "orbitHop", title: "Orbit Hop", emoji: "🪐", how: "TAP to launch out of orbit · land on the glowing planet!" },
  ],
  farm: [
    { id: "eggCatch", title: "Egg Catch", emoji: "🥚", how: "SLIDE left & right · catch the eggs, not the mud pies!" },
    { id: "moleMash", title: "Mole Mash", emoji: "🐹", how: "TAP the moles when they pop up · don't bonk the bunnies!" },
    { id: "pumpkinPunt", title: "Pumpkin Punt", emoji: "🎃", how: "SLIDE to bounce the pumpkin · smash every star!" },
  ],
  dino: [
    { id: "lavaLeap", title: "Lava Leap", emoji: "🌋", how: "TAP to jump · grab dino eggs, leap over lava rocks!" },
    { id: "meteorDodge", title: "Meteor Dodge", emoji: "☄️", how: "SLIDE to dodge falling meteors · catch the eggs!" },
    { id: "cliffHopper", title: "Cliff Hopper", emoji: "🦕", how: "HOLD to charge, LET GO to leap · land on the next ledge!" },
  ],
};

export interface Frame {
  W: number; H: number; t: number; dt: number; sizeF: number; floorY: number;
}
export interface Input { down: boolean; x: number; y: number } // x,y normalized 0..1
export interface GameAPI {
  score(n: number): void;
  hurt(): void;
  inv(): boolean;
  blip(): void;
}
export interface GameInstance {
  heroX: number; heroY: number; tilt: number; heroScale: number;
  onDown?(f: Frame, inp: Input): void;
  onUp?(f: Frame): void;
  update(f: Frame, inp: Input, api: GameAPI): void;
  draw(ctx: CanvasRenderingContext2D, f: Frame): void;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rnd = Math.random;

/* ── shared entity painters ─────────────────────────────────────────────── */

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

function paintJelly(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.rotate(Math.sin(t * 2 + seed) * 0.15);
  ctx.fillStyle = "rgba(251,102,229,0.85)";
  ctx.beginPath(); ctx.arc(0, -r * 0.15, r * 0.72, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = "rgba(251,102,229,0.7)";
  ctx.lineWidth = 3;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(k * r * 0.26, -r * 0.12);
    ctx.quadraticCurveTo(k * r * 0.3 + Math.sin(t * 4 + k) * 5, r * 0.5, k * r * 0.26, r * 0.9);
    ctx.stroke();
  }
  ctx.fillStyle = "#2d2926";
  ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.28, 2.4, 0, 7); ctx.arc(r * 0.22, -r * 0.28, 2.4, 0, 7); ctx.fill();
}

function paintFoodBubble(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2.5;
  ctx.fillStyle = "rgba(255,236,150,0.55)";
  ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ffd65a";
  star5(ctx, 0, 0, r * 0.42, t * 2 + seed);
}

function paintStarPickup(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.fillStyle = "#ffe066";
  star5(ctx, 0, 0, r * 0.85, t + seed);
  ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 5 + seed);
  ctx.fillStyle = "#fff3c4";
  star5(ctx, 0, 0, r * 1.25, t + seed);
  ctx.globalAlpha = 1;
}

function paintAsteroid(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.rotate(t * 0.8 + seed);
  ctx.fillStyle = "#8d8399";
  ctx.strokeStyle = "#5a5266";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const rad = r * (0.75 + ((k * 37 + seed * 13) % 10) / 34);
    if (k === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#6f6579";
  ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.1, r * 0.18, 0, 7); ctx.arc(r * 0.25, r * 0.2, r * 0.13, 0, 7); ctx.fill();
}

function paintEgg(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number, spots = "#ffd9a0") {
  ctx.rotate(Math.sin(t * 3 + seed) * 0.2);
  ctx.fillStyle = "#fff7e8";
  ctx.strokeStyle = "#d9c4a5";
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = spots;
  ctx.beginPath(); ctx.arc(-r * 0.15, -r * 0.15, r * 0.14, 0, 7); ctx.arc(r * 0.18, r * 0.22, r * 0.1, 0, 7); ctx.fill();
}

function paintMud(ctx: CanvasRenderingContext2D, r: number) {
  ctx.fillStyle = "#7a4a21";
  ctx.beginPath(); ctx.ellipse(0, r * 0.2, r * 0.8, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#5d3717";
  ctx.beginPath(); ctx.arc(-r * 0.2, r * 0.05, r * 0.18, 0, 7); ctx.arc(r * 0.25, r * 0.15, r * 0.14, 0, 7); ctx.fill();
}

function paintLavaRock(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.rotate(Math.sin(t + seed) * 0.06);
  ctx.fillStyle = "#3a2b33";
  ctx.strokeStyle = "#241a20";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, r * 0.7);
  ctx.lineTo(-r * 0.5, -r * 0.5);
  ctx.lineTo(r * 0.1, -r * 0.75);
  ctx.lineTo(r * 0.7, -r * 0.2);
  ctx.lineTo(r * 0.9, r * 0.7);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#ff7a45";
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.3); ctx.lineTo(-r * 0.1, r * 0.2); ctx.moveTo(r * 0.25, -r * 0.15); ctx.lineTo(r * 0.4, r * 0.35); ctx.stroke();
}

function paintDinoEgg(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.rotate(Math.sin(t * 3 + seed) * 0.12);
  ctx.fillStyle = "#f4e9d4";
  ctx.strokeStyle = "#c9b18a";
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#3aae3a";
  ctx.beginPath(); ctx.arc(-r * 0.12, -r * 0.2, r * 0.15, 0, 7); ctx.arc(r * 0.2, r * 0.18, r * 0.12, 0, 7); ctx.arc(0, r * 0.42, r * 0.1, 0, 7); ctx.fill();
}

interface Ent { x: number; y: number; r: number; good: boolean; seed: number; vy: number }

/* ── OCEAN 1 · Bubble Gulp — hold to rise, release to sink ──────────────── */

function bubbleGulp(): GameInstance {
  let hy = 0.5, vy = 0, spawnT = 0.6, speed = 150;
  const ents: Ent[] = [];
  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    update(f, inp, api) {
      speed += f.dt * 2.2;
      vy += (inp.down ? -620 : 380) * f.dt;
      vy = clamp(vy, -330, 330);
      hy = clamp(hy + (vy * f.dt) / f.H, 0.08, f.floorY / f.H - 0.04);
      g.heroX = f.W * 0.25; g.heroY = hy * f.H;
      g.tilt = clamp(vy / 500, -0.5, 0.5);
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const good = rnd() > Math.min(0.42, 0.2 + f.t / 220);
        ents.push({ x: 1.08, y: 0.1 + rnd() * (f.floorY / f.H - 0.16), r: good ? 22 : 30, good, seed: rnd() * 10, vy: 0 });
        spawnT = 0.7 - Math.min(0.28, f.t / 260);
      }
      const heroR = 30 * f.sizeF + 8;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        e.x -= ((speed + (e.good ? 0 : 26)) * f.dt) / f.W;
        e.y += Math.sin(f.t * 2.2 + e.seed) * 0.00005 * f.dt * 60000;
        if (e.x < -0.1) { ents.splice(i, 1); continue; }
        const ex = e.x * f.W, ey = e.y * f.H;
        if (Math.hypot(ex - g.heroX, ey - g.heroY) < heroR + (e.r * f.sizeF + 6) * 0.8) {
          ents.splice(i, 1);
          if (e.good) api.score(10); else api.hurt();
        }
      }
    },
    draw(ctx, f) {
      for (const e of ents) {
        ctx.save();
        ctx.translate(e.x * f.W, e.y * f.H);
        if (e.good) paintFoodBubble(ctx, e.r * f.sizeF + 6, f.t, e.seed);
        else paintJelly(ctx, e.r * f.sizeF + 6, f.t, e.seed);
        ctx.restore();
      }
    },
  };
  return g;
}

/* ── OCEAN 2 · Coral Glide — flappy through coral gates ─────────────────── */

function coralGlide(): GameInstance {
  let hy = 0.4, vy = 0, spawnT = 1.4, speed = 175;
  const gates: { x: number; gapY: number; gapH: number; passed: boolean }[] = [];
  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    onDown(f) { vy = -440 * f.sizeF; },
    update(f, _inp, api) {
      speed += f.dt * 1.6;
      vy += 1180 * f.sizeF * f.dt;
      vy = clamp(vy, -460 * f.sizeF, 560 * f.sizeF);
      hy += (vy * f.dt) / f.H;
      const heroR = 24 * f.sizeF + 8;
      const minY = heroR / f.H + 0.01, maxY = (f.floorY - heroR * 0.4) / f.H;
      if (hy < minY) { hy = minY; vy = 0; }
      if (hy > maxY) { hy = maxY; vy = 0; }
      g.heroX = f.W * 0.3; g.heroY = hy * f.H;
      g.tilt = clamp(vy / (700 * f.sizeF), -0.5, 0.6);
      spawnT -= f.dt;
      if (spawnT <= 0) {
        gates.push({ x: f.W + 70, gapY: f.H * (0.22 + rnd() * 0.42), gapH: clamp(210 * f.sizeF, 150, 250), passed: false });
        spawnT = Math.max(1.5, 2.1 - f.t / 120);
      }
      const colW = 52 * f.sizeF;
      for (let i = gates.length - 1; i >= 0; i--) {
        const gt = gates[i];
        gt.x -= speed * f.dt;
        if (gt.x < -100) { gates.splice(i, 1); continue; }
        if (!gt.passed && gt.x + colW / 2 < g.heroX) { gt.passed = true; api.score(10); }
        if (Math.abs(gt.x - g.heroX) < colW / 2 + heroR * 0.65 &&
            Math.abs(g.heroY - gt.gapY) > gt.gapH / 2 - heroR * 0.55) {
          api.hurt();
        }
      }
    },
    draw(ctx, f) {
      const colW = 52 * f.sizeF;
      for (const gt of gates) {
        for (const [y0, y1] of [[-10, gt.gapY - gt.gapH / 2], [gt.gapY + gt.gapH / 2, f.H + 10]] as const) {
          const hgt = y1 - y0;
          if (hgt <= 0) continue;
          ctx.save();
          ctx.translate(gt.x, y0);
          const grad = ctx.createLinearGradient(-colW / 2, 0, colW / 2, 0);
          grad.addColorStop(0, "#ff8fb2");
          grad.addColorStop(0.5, "#fb66e5");
          grad.addColorStop(1, "#c74bb8");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(-colW / 2, 0, colW, hgt, 14);
          ctx.fill();
          /* branch nubs */
          ctx.fillStyle = "#ffb3d1";
          for (let b = 0; b < Math.floor(hgt / 46); b++) {
            const side = b % 2 ? 1 : -1;
            ctx.beginPath();
            ctx.arc(side * colW * 0.55, 24 + b * 46, 8 * f.sizeF, 0, Math.PI * 2);
            ctx.fill();
          }
          /* glowing rim at the gap edge */
          ctx.fillStyle = "#fff3c4";
          ctx.beginPath();
          ctx.arc(0, y1 === f.H + 10 ? 0 : hgt, 9 * f.sizeF, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    },
  };
  return g;
}

/* ── whack engine (Crab Tap / Mole Mash) ────────────────────────────────── */

type PopPainter = (ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) => void;

function paintCrab(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.fillStyle = "#ff6b4a";
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.75, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  /* claws */
  const wave = Math.sin(t * 5 + seed) * 0.25;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * r * 0.75, -r * 0.15);
    ctx.rotate(s * (0.5 + wave));
    ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  /* eyes on stalks */
  ctx.strokeStyle = "#ff6b4a";
  ctx.lineWidth = 2.5;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(s * r * 0.25, -r * 0.35); ctx.lineTo(s * r * 0.3, -r * 0.65); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(s * r * 0.3, -r * 0.7, r * 0.14, 0, 7); ctx.fill();
    ctx.fillStyle = "#2d2926";
    ctx.beginPath(); ctx.arc(s * r * 0.3, -r * 0.7, r * 0.06, 0, 7); ctx.fill();
    ctx.fillStyle = "#ff6b4a";
  }
}

function paintPuffer(ctx: CanvasRenderingContext2D, r: number, t: number) {
  ctx.fillStyle = "#ffd65a";
  ctx.strokeStyle = "#d9a52b";
  ctx.lineWidth = 2;
  /* spikes */
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.sin(t * 3) * 0.05;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
    ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#2d2926";
  ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.1, 2.6, 0, 7); ctx.arc(r * 0.2, -r * 0.1, 2.6, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(0, r * 0.18, r * 0.1, 0, Math.PI); ctx.stroke();
}

function paintMole(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  ctx.fillStyle = "#8a5a3b";
  ctx.beginPath(); ctx.ellipse(0, r * 0.1, r * 0.6, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#caa27e";
  ctx.beginPath(); ctx.ellipse(0, r * 0.32, r * 0.34, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffb3c2"; // snout
  ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.14, 0, 7); ctx.fill();
  ctx.fillStyle = "#2d2926";
  ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.22, 2.6, 0, 7); ctx.arc(r * 0.22, -r * 0.22, 2.6, 0, 7); ctx.fill();
  /* paws up */
  const wave = Math.sin(t * 6 + seed) * 0.2;
  ctx.fillStyle = "#caa27e";
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.arc(s * r * 0.55, -r * 0.15 + wave * 6, r * 0.14, 0, 7); ctx.fill();
  }
}

function paintBunny(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number) {
  const wiggle = Math.sin(t * 8 + seed) * 0.12;
  ctx.fillStyle = "#f2ede4";
  for (const s of [-1, 1]) { // ears
    ctx.save();
    ctx.translate(s * r * 0.22, -r * 0.6);
    ctx.rotate(s * 0.18 + wiggle);
    ctx.beginPath(); ctx.ellipse(0, -r * 0.3, r * 0.13, r * 0.34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.5, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2d2926";
  ctx.beginPath(); ctx.arc(-r * 0.18, -r * 0.08, 2.6, 0, 7); ctx.arc(r * 0.18, -r * 0.08, 2.6, 0, 7); ctx.fill();
  ctx.fillStyle = "#ffb3c2";
  ctx.beginPath(); ctx.arc(0, r * 0.08, r * 0.09, 0, 7); ctx.fill();
}

function whack(goodPaint: PopPainter, badPaint: PopPainter, holeCol: string): GameInstance {
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
function popRise(age: number) {
  const u = Math.min(1, age / 0.22);
  return 1 - (1 - u) * (1 - u); // ease-out
}

/* ── SPACE 1 · Star Rush — drag to steer ────────────────────────────────── */

function starRush(): GameInstance {
  let hx = 0.25, hy = 0.5, spawnT = 0.6, speed = 160;
  const ents: Ent[] = [];
  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    update(f, inp, api) {
      speed += f.dt * 2.2;
      hx += (inp.x - hx) * Math.min(1, f.dt * 6);
      hy += (inp.y - hy) * Math.min(1, f.dt * 6);
      hx = clamp(hx, 0.06, 0.94);
      hy = clamp(hy, 0.06, f.floorY / f.H - 0.04);
      g.heroX = hx * f.W; g.heroY = hy * f.H;
      g.tilt = clamp((inp.x - hx) * 1.4, -0.4, 0.4);
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const good = rnd() > Math.min(0.42, 0.2 + f.t / 220);
        ents.push({ x: 1.08, y: 0.08 + rnd() * (f.floorY / f.H - 0.14), r: good ? 22 : 30, good, seed: rnd() * 10, vy: 0 });
        spawnT = 0.7 - Math.min(0.28, f.t / 260);
      }
      const heroR = 30 * f.sizeF + 8;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        e.x -= ((speed + (e.good ? 0 : 26)) * f.dt) / f.W;
        if (e.x < -0.1) { ents.splice(i, 1); continue; }
        const ex = e.x * f.W, ey = e.y * f.H;
        if (Math.hypot(ex - g.heroX, ey - g.heroY) < heroR + (e.r * f.sizeF + 6) * 0.8) {
          ents.splice(i, 1);
          if (e.good) api.score(10); else api.hurt();
        }
      }
    },
    draw(ctx, f) {
      for (const e of ents) {
        ctx.save();
        ctx.translate(e.x * f.W, e.y * f.H);
        if (e.good) paintStarPickup(ctx, e.r * f.sizeF + 6, f.t, e.seed);
        else paintAsteroid(ctx, e.r * f.sizeF + 6, f.t, e.seed);
        ctx.restore();
      }
    },
  };
  return g;
}

/* ── SPACE 2 · Astro Lanes — tap high/low to switch lanes ───────────────── */

function astroLanes(): GameInstance {
  const LANE_FR = [0.2, 0.4, 0.6];
  let lane = 1, hy = 0.4, spawnT = 0.8, speed = 200;
  const ents: (Ent & { lane: number })[] = [];
  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    onDown(_f, inp) {
      let best = 0, bd = 9;
      LANE_FR.forEach((fr, i) => { const d = Math.abs(inp.y - fr); if (d < bd) { bd = d; best = i; } });
      lane = best;
    },
    update(f, _inp, api) {
      speed += f.dt * 2.4;
      const targetY = LANE_FR[lane];
      const prev = hy;
      hy += (targetY - hy) * Math.min(1, f.dt * 8);
      g.heroX = f.W * 0.22; g.heroY = hy * f.H;
      g.tilt = clamp((hy - prev) * 30, -0.45, 0.45);
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const good = rnd() > Math.min(0.45, 0.24 + f.t / 200);
        ents.push({ x: 1.06, y: 0, lane: Math.floor(rnd() * 3), r: good ? 22 : 30, good, seed: rnd() * 10, vy: 0 });
        spawnT = Math.max(0.5, 0.85 - f.t / 200);
      }
      const heroR = 28 * f.sizeF + 8;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        e.x -= (speed * f.dt) / f.W;
        if (e.x < -0.08) { ents.splice(i, 1); continue; }
        const ex = e.x * f.W, ey = LANE_FR[e.lane] * f.H;
        if (Math.hypot(ex - g.heroX, ey - g.heroY) < heroR + (e.r * f.sizeF + 6) * 0.75) {
          ents.splice(i, 1);
          if (e.good) api.score(10); else api.hurt();
        }
      }
    },
    draw(ctx, f) {
      /* lane guides */
      ctx.save();
      ctx.strokeStyle = "rgba(180,170,255,0.14)";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 14]);
      for (const fr of LANE_FR) {
        ctx.beginPath();
        ctx.moveTo(0, fr * f.H);
        ctx.lineTo(f.W, fr * f.H);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
      for (const e of ents) {
        ctx.save();
        ctx.translate(e.x * f.W, LANE_FR[e.lane] * f.H);
        if (e.good) paintStarPickup(ctx, e.r * f.sizeF + 6, f.t, e.seed);
        else paintAsteroid(ctx, e.r * f.sizeF + 6, f.t, e.seed);
        ctx.restore();
      }
    },
  };
  return g;
}

/* ── SPACE 3 · Orbit Hop — tap to launch from orbit to orbit ────────────── */

interface Planet { x: number; y: number; r: number; col1: string; col2: string }

function orbitHop(): GameInstance {
  let cur: Planet | null = null, next: Planet | null = null;
  let ang = 0, mode: "orbit" | "fly" = "orbit";
  let px = 0, py = 0, vx = 0, vy = 0;
  const PALETTES: [string, string][] = [["#ffd65a", "#ff9d5c"], ["#7ef0e2", "#0fa8a0"], ["#ff9ad5", "#c74bb8"], ["#b3c6ff", "#5f7de0"]];
  const spawnNext = (f: Frame) => {
    const pal = PALETTES[Math.floor(rnd() * PALETTES.length)];
    next = {
      x: clamp((cur!.x) + f.W * (0.24 + rnd() * 0.26), f.W * 0.4, f.W * 0.88),
      y: f.H * (0.18 + rnd() * 0.34),
      r: (26 + rnd() * 14) * f.sizeF,
      col1: pal[0], col2: pal[1],
    };
  };
  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 0.85,
    onDown(f) {
      if (mode !== "orbit" || !cur) return;
      mode = "fly";
      const sp = 310 * f.sizeF;
      vx = -Math.sin(ang) * sp + Math.cos(ang) * 90 * f.sizeF;
      vy = Math.cos(ang) * sp + Math.sin(ang) * 90 * f.sizeF;
    },
    update(f, _inp, api) {
      if (!cur) {
        cur = { x: f.W * 0.28, y: f.H * 0.42, r: 34 * f.sizeF, col1: "#c79bff", col2: "#8b46c7" };
        spawnNext(f);
      }
      if (mode === "orbit") {
        ang += f.dt * 1.7;
        px = cur.x + Math.cos(ang) * (cur.r + 34 * f.sizeF);
        py = cur.y + Math.sin(ang) * (cur.r + 34 * f.sizeF);
        g.tilt = ang + Math.PI / 2;
      } else {
        px += vx * f.dt; py += vy * f.dt;
        g.tilt = Math.atan2(vy, vx) + Math.PI / 2;
        /* homing assist toward the target planet */
        if (next) {
          const dx = next.x - px, dy = next.y - py;
          const d = Math.hypot(dx, dy);
          if (d < next.r + 110 * f.sizeF) {
            vx += (dx / d) * 950 * f.dt;
            vy += (dy / d) * 950 * f.dt;
            const sp = Math.hypot(vx, vy), cap = 400 * f.sizeF;
            if (sp > cap) { vx = (vx / sp) * cap; vy = (vy / sp) * cap; }
          }
          if (d < next.r + 26 * f.sizeF) {
            /* docked! */
            api.score(10);
            ang = Math.atan2(py - next.y, px - next.x);
            const shift = next.x - f.W * 0.28;
            cur = { ...next, x: next.x - shift };
            px -= shift;
            spawnNext(f);
            mode = "orbit";
          }
        }
        if (px < -50 || px > f.W + 50 || py < -60 || py > f.H + 60) {
          api.hurt();
          mode = "orbit";
          ang = -Math.PI / 2;
        }
      }
      g.heroX = px; g.heroY = py;
    },
    draw(ctx, f) {
      const planet = (p: Planet, pulse: boolean) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        if (pulse) {
          const pu = 1 + Math.sin(f.t * 4) * 0.06;
          ctx.scale(pu, pu);
          ctx.strokeStyle = `rgba(255,230,150,${0.5 + Math.sin(f.t * 4) * 0.25})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 8]);
          ctx.beginPath();
          ctx.arc(0, 0, p.r + 34 * f.sizeF, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = "rgba(200,190,255,0.25)";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 10]);
          ctx.beginPath();
          ctx.arc(0, 0, p.r + 34 * f.sizeF, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const pg = ctx.createRadialGradient(-p.r * 0.35, -p.r * 0.35, p.r * 0.1, 0, 0, p.r);
        pg.addColorStop(0, p.col1);
        pg.addColorStop(1, p.col2);
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.beginPath();
        ctx.arc(-p.r * 0.3, -p.r * 0.35, p.r * 0.22, 0, 7);
        ctx.fill();
        ctx.restore();
      };
      if (cur) planet(cur, false);
      if (next) planet(next, true);
      /* direction hint while orbiting */
      if (mode === "orbit" && next && cur) {
        const a = Math.atan2(next.y - py, next.x - px);
        ctx.save();
        ctx.translate(px + Math.cos(a) * 52 * f.sizeF, py + Math.sin(a) * 52 * f.sizeF);
        ctx.rotate(a);
        ctx.globalAlpha = 0.5 + Math.sin(f.t * 5) * 0.3;
        ctx.fillStyle = "#ffe066";
        ctx.beginPath();
        ctx.moveTo(10, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    },
  };
  return g;
}

/* ── FARM 1 · Egg Catch — slide to catch ────────────────────────────────── */

function eggCatch(): GameInstance {
  let hx = 0.5, spawnT = 0.7;
  const ents: Ent[] = [];
  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    update(f, inp, api) {
      hx += (inp.x - hx) * Math.min(1, f.dt * 9);
      hx = clamp(hx, 0.06, 0.94);
      g.heroX = hx * f.W;
      g.heroY = f.floorY - 0.02 * f.H;
      g.tilt = clamp((inp.x - hx) * 0.9, -0.4, 0.4);
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const good = rnd() > Math.min(0.4, 0.2 + f.t / 240);
        ents.push({ x: 0.06 + rnd() * 0.88, y: -0.06, r: 24, good, seed: rnd() * 10, vy: 130 + rnd() * 60 + f.t * 1.2 });
        spawnT = 0.75 - Math.min(0.3, f.t / 240);
      }
      const heroR = 34 * f.sizeF + 8;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        e.y += (e.vy * f.dt) / f.H;
        if (e.y > f.floorY / f.H + 0.05) { ents.splice(i, 1); continue; }
        const ex = e.x * f.W, ey = e.y * f.H;
        if (Math.hypot(ex - g.heroX, ey - g.heroY) < heroR + (e.r * f.sizeF + 6) * 0.75) {
          ents.splice(i, 1);
          if (e.good) api.score(10); else api.hurt();
        }
      }
    },
    draw(ctx, f) {
      for (const e of ents) {
        ctx.save();
        ctx.translate(e.x * f.W, e.y * f.H);
        if (e.good) paintEgg(ctx, e.r * f.sizeF + 6, f.t, e.seed);
        else paintMud(ctx, e.r * f.sizeF + 6);
        ctx.restore();
      }
    },
  };
  return g;
}

/* ── FARM 3 · Pumpkin Punt — paddle bounce breakout ─────────────────────── */

function pumpkinPunt(): GameInstance {
  let px = 0.5;
  let bx = 0, by = 0, bvx = 0, bvy = 0, spin = 0;
  let targets: { x: number; y: number; alive: boolean; seed: number }[] = [];
  let wave = 0, served = false;
  const serve = (f: Frame) => {
    bx = f.W * 0.5; by = f.H * 0.5;
    const a = Math.PI / 2 + (rnd() - 0.5) * 0.9;
    const sp = 260 * f.sizeF;
    bvx = Math.cos(a) * sp; bvy = Math.abs(Math.sin(a)) * sp;
  };
  const makeWave = (f: Frame) => {
    targets = [];
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 5; i++) {
        targets.push({ x: f.W * (0.14 + i * 0.18), y: f.H * (0.13 + row * 0.1), alive: true, seed: rnd() * 10 });
      }
    }
  };
  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    update(f, inp, api) {
      if (!served) { serve(f); makeWave(f); served = true; }
      px += (inp.x - px) * Math.min(1, f.dt * 10);
      px = clamp(px, 0.08, 0.92);
      const padY = f.H - 44 * f.sizeF;
      g.heroX = px * f.W; g.heroY = padY;
      g.tilt = clamp((inp.x - px) * 0.8, -0.35, 0.35);

      bx += bvx * f.dt; by += bvy * f.dt;
      spin += f.dt * 4;
      const br = 15 * f.sizeF;
      if (bx < br) { bx = br; bvx = Math.abs(bvx); api.blip(); }
      if (bx > f.W - br) { bx = f.W - br; bvx = -Math.abs(bvx); api.blip(); }
      if (by < br) { by = br; bvy = Math.abs(bvy); api.blip(); }
      /* paddle bounce */
      const halfW = 58 * f.sizeF;
      if (bvy > 0 && Math.abs(bx - px * f.W) < halfW && Math.abs(by - padY) < 26 * f.sizeF) {
        by = padY - 24 * f.sizeF;
        bvy = -Math.abs(bvy) * 1.015;
        bvx += (bx - px * f.W) * 3.4;
        bvx = clamp(bvx, -420 * f.sizeF, 420 * f.sizeF);
        api.blip();
      }
      /* star targets */
      let alive = 0;
      for (const tg of targets) {
        if (!tg.alive) continue;
        alive++;
        if (Math.hypot(bx - tg.x, by - tg.y) < br + 20 * f.sizeF) {
          tg.alive = false;
          bvy = -bvy;
          api.score(10);
        }
      }
      if (alive === 0) {
        wave++;
        makeWave(f);
        bvx *= 1.08; bvy *= 1.08;
      }
      /* lost ball */
      if (by > f.H + 30) {
        api.hurt();
        serve(f);
      }
    },
    draw(ctx, f) {
      /* star targets on hay wisps */
      for (const tg of targets) {
        if (!tg.alive) continue;
        ctx.save();
        ctx.translate(tg.x, tg.y);
        paintStarPickup(ctx, 17 * f.sizeF, f.t, tg.seed);
        ctx.restore();
      }
      /* the pumpkin ball */
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(Math.sin(spin) * 0.3);
      const pr = 15 * f.sizeF;
      ctx.fillStyle = "#ff9430";
      ctx.beginPath(); ctx.arc(0, 0, pr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#d96f14";
      ctx.lineWidth = 2;
      for (const off of [-0.5, 0, 0.5]) {
        ctx.beginPath();
        ctx.ellipse(off * pr * 0.55, 0, pr * 0.45, pr * 0.94, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#3aae3a";
      ctx.fillRect(-2.5, -pr - 6, 5, 8);
      ctx.restore();
    },
  };
  return g;
}

/* ── DINO 1 · Lava Leap — tap-to-jump auto-runner ───────────────────────── */

function lavaLeap(): GameInstance {
  let hy = 0, vy = 0, jumps = 0, spawnT = 0.8, speed = 190, init = false;
  const ents: Ent[] = [];
  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    onDown() { if (jumps < 2) { vy = -640; jumps++; } },
    update(f, _inp, api) {
      if (!init) { hy = (f.floorY - 0.015 * f.H) / f.H; init = true; }
      speed += f.dt * 2.4;
      const ground = (f.floorY - 0.015 * f.H) / f.H;
      vy += 1500 * f.dt;
      hy += (vy * f.dt) / f.H;
      if (hy >= ground) { hy = ground; vy = 0; jumps = 0; }
      g.heroX = f.W * 0.25; g.heroY = hy * f.H;
      g.tilt = hy < ground - 0.01 ? clamp(vy / 1600, -0.35, 0.45) : 0;
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const good = rnd() > Math.min(0.45, 0.25 + f.t / 200);
        /* rocks on the ground, eggs float at jump height */
        const y = good ? ground - 0.1 - rnd() * 0.12 : ground;
        ents.push({ x: 1.08, y, r: good ? 20 : 30, good, seed: rnd() * 10, vy: 0 });
        spawnT = Math.max(0.55, 0.95 - f.t / 260);
      }
      const heroR = 28 * f.sizeF + 8;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        e.x -= (speed * f.dt) / f.W;
        if (e.x < -0.1) { ents.splice(i, 1); continue; }
        const ex = e.x * f.W, ey = e.y * f.H - (e.good ? 0 : 14 * f.sizeF);
        if (Math.hypot(ex - g.heroX, ey - g.heroY) < heroR + (e.r * f.sizeF + 6) * 0.72) {
          ents.splice(i, 1);
          if (e.good) api.score(10); else api.hurt();
        }
      }
    },
    draw(ctx, f) {
      for (const e of ents) {
        ctx.save();
        ctx.translate(e.x * f.W, e.y * f.H - (e.good ? 0 : 14 * f.sizeF));
        if (e.good) paintDinoEgg(ctx, e.r * f.sizeF + 6, f.t, e.seed);
        else paintLavaRock(ctx, e.r * f.sizeF + 6, f.t, e.seed);
        ctx.restore();
      }
    },
  };
  return g;
}

/* ── DINO 2 · Meteor Dodge — slide to dodge, catch eggs ─────────────────── */

function meteorDodge(): GameInstance {
  let hx = 0.5, spawnT = 0.9;
  const ents: Ent[] = [];
  const booms: { x: number; t0: number }[] = [];
  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 1,
    update(f, inp, api) {
      hx += (inp.x - hx) * Math.min(1, f.dt * 8);
      hx = clamp(hx, 0.06, 0.94);
      g.heroX = hx * f.W;
      g.heroY = f.floorY - 24 * f.sizeF;
      g.tilt = clamp((inp.x - hx) * 0.8, -0.4, 0.4);
      spawnT -= f.dt;
      if (spawnT <= 0) {
        const good = rnd() > 0.55;
        ents.push({
          x: 0.06 + rnd() * 0.88, y: -0.08, r: good ? 20 : 26, good, seed: rnd() * 10,
          vy: (good ? 190 : 240) + f.t * 2.2 + rnd() * 50,
        });
        spawnT = Math.max(0.45, 0.9 - f.t / 200);
      }
      const heroR = 30 * f.sizeF + 8;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        e.y += (e.vy * f.dt) / f.H;
        const ex = e.x * f.W, ey = e.y * f.H;
        if (Math.hypot(ex - g.heroX, ey - g.heroY) < heroR + (e.r * f.sizeF + 4) * 0.72) {
          ents.splice(i, 1);
          if (e.good) api.score(10); else api.hurt();
          continue;
        }
        if (ey > f.floorY - 4) {
          ents.splice(i, 1);
          if (!e.good) booms.push({ x: ex, t0: f.t });
        }
      }
      for (let i = booms.length - 1; i >= 0; i--) {
        if (f.t - booms[i].t0 > 0.5) booms.splice(i, 1);
      }
    },
    draw(ctx, f) {
      for (const e of ents) {
        const ex = e.x * f.W, ey = e.y * f.H;
        if (!e.good) {
          /* telegraph shadow on the ground */
          const near = clamp(ey / f.floorY, 0.15, 1);
          ctx.save();
          ctx.globalAlpha = 0.3 * near;
          ctx.fillStyle = "#ff5a3c";
          ctx.beginPath();
          ctx.ellipse(ex, f.floorY + 6, (e.r * f.sizeF + 10) * near, 7 * near, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.save();
        ctx.translate(ex, ey);
        if (e.good) paintDinoEgg(ctx, e.r * f.sizeF + 6, f.t, e.seed);
        else {
          ctx.rotate(f.t * 3 + e.seed);
          paintLavaRock(ctx, e.r * f.sizeF + 6, f.t, e.seed);
          /* flame trail */
          ctx.fillStyle = "rgba(255,150,60,0.5)";
          ctx.beginPath();
          ctx.moveTo(-6, -e.r * f.sizeF * 0.6);
          ctx.quadraticCurveTo(0, -e.r * f.sizeF * 1.8, 6, -e.r * f.sizeF * 0.6);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      /* impact rings */
      for (const b of booms) {
        const p = (f.t - b.t0) / 0.5;
        ctx.save();
        ctx.globalAlpha = (1 - p) * 0.7;
        ctx.strokeStyle = "#ff7a45";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.x, f.floorY, 8 + p * 46 * f.sizeF, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
  };
  return g;
}

/* ── DINO 3 · Cliff Hopper — hold to charge, release to leap ────────────── */

interface Ledge { x: number; y: number; w: number }

function cliffHopper(): GameInstance {
  let base: Ledge | null = null, next: Ledge | null = null;
  let mode: "aim" | "fly" = "aim";
  let charging = false, chargeT = 0;
  let px = 0, py = 0, vx = 0, vy = 0;
  const spawnNext = (f: Frame) => {
    next = {
      x: base!.x + (170 + rnd() * 130) * f.sizeF,
      y: clamp(base!.y + (rnd() - 0.5) * 130 * f.sizeF, f.H * 0.32, f.floorY - 16 * f.sizeF),
      w: 110 * f.sizeF,
    };
  };
  const power = () => { // ping-pong 0→1→0
    const u = (chargeT * 1.3) % 2;
    return u < 1 ? u : 2 - u;
  };
  const g: GameInstance = {
    heroX: 0, heroY: 0, tilt: 0, heroScale: 0.9,
    onDown() { if (mode === "aim") { charging = true; chargeT = 0; } },
    onUp(f) {
      if (mode !== "aim" || !charging || !base) return;
      charging = false;
      const p = power();
      vx = (180 + p * 300) * f.sizeF;
      vy = -(400 + p * 250) * f.sizeF;
      mode = "fly";
    },
    update(f, _inp, api) {
      if (!base) {
        base = { x: f.W * 0.24, y: f.floorY - 26 * f.sizeF, w: 120 * f.sizeF };
        px = base.x; py = base.y;
        spawnNext(f);
      }
      if (charging) chargeT += f.dt;
      if (mode === "aim") {
        px = base.x; py = base.y;
        g.tilt = charging ? Math.sin(f.t * 14) * 0.05 : 0;
      } else {
        vy += 1400 * f.sizeF * f.dt;
        px += vx * f.dt; py += vy * f.dt;
        g.tilt = clamp(Math.atan2(vy, vx * 2), -0.4, 0.5);
        /* landing check while falling */
        if (vy > 0 && next) {
          const top = next.y;
          if (py >= top - 4 && py - vy * f.dt < top + 4 && Math.abs(px - next.x) < next.w / 2) {
            api.score(10);
            /* the world shifts: landed ledge becomes the new base */
            base = { x: f.W * 0.24, y: next.y, w: next.w };
            px = base.x; py = base.y;
            spawnNext(f);
            mode = "aim";
            charging = false;
          }
        }
        if (py > f.floorY + 40 * f.sizeF || px > f.W + 40) {
          api.hurt();
          px = base.x; py = base.y;
          mode = "aim";
          charging = false;
        }
      }
      g.heroX = px; g.heroY = py - 26 * f.sizeF;
    },
    draw(ctx, f) {
      const ledge = (l: Ledge, glow: boolean) => {
        ctx.save();
        ctx.translate(l.x, l.y);
        if (glow) {
          ctx.globalAlpha = 0.4 + Math.sin(f.t * 4) * 0.2;
          ctx.fillStyle = "#ffe066";
          ctx.beginPath();
          ctx.ellipse(0, 2, l.w * 0.62, 12 * f.sizeF, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = "#5a4632";
        ctx.beginPath(); // rocky slab
        ctx.moveTo(-l.w / 2, 0);
        ctx.lineTo(l.w / 2, 0);
        ctx.lineTo(l.w * 0.32, 26 * f.sizeF);
        ctx.lineTo(-l.w * 0.3, 30 * f.sizeF);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#7a6248";
        ctx.beginPath();
        ctx.ellipse(0, 0, l.w / 2, 8 * f.sizeF, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
      if (base) ledge(base, false);
      if (next) ledge(next, true);
      /* charge meter + predicted arc */
      if (charging && base) {
        const p = power();
        /* arc preview */
        ctx.save();
        ctx.fillStyle = "rgba(255,230,150,0.8)";
        let ax = px, ay = py - 26 * f.sizeF;
        let avx = (180 + p * 300) * f.sizeF, avy = -(400 + p * 250) * f.sizeF;
        const step = 0.09;
        for (let i = 0; i < 12; i++) {
          avy += 1400 * f.sizeF * step;
          ax += avx * step; ay += avy * step;
          ctx.globalAlpha = 0.85 - i * 0.065;
          ctx.beginPath();
          ctx.arc(ax, ay, 3.4 * f.sizeF, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        /* power bar */
        ctx.save();
        ctx.translate(px, py - 78 * f.sizeF);
        ctx.fillStyle = "rgba(20,20,40,0.55)";
        ctx.beginPath(); ctx.roundRect(-40, -8, 80, 14, 7); ctx.fill();
        const grad = ctx.createLinearGradient(-40, 0, 40, 0);
        grad.addColorStop(0, "#3aae3a");
        grad.addColorStop(0.6, "#ffd65a");
        grad.addColorStop(1, "#ff5a3c");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.roundRect(-38, -6, 76 * p, 10, 5); ctx.fill();
        ctx.restore();
      }
    },
  };
  return g;
}

/* ── factory ────────────────────────────────────────────────────────────── */

export function createGame(id: string): GameInstance {
  switch (id) {
    case "bubbleGulp": return bubbleGulp();
    case "coralGlide": return coralGlide();
    case "crabTap": return whack(paintCrab, paintPuffer, "rgba(90,60,30,0.55)");
    case "starRush": return starRush();
    case "astroLanes": return astroLanes();
    case "orbitHop": return orbitHop();
    case "eggCatch": return eggCatch();
    case "moleMash": return whack(paintMole, paintBunny, "rgba(60,40,20,0.5)");
    case "pumpkinPunt": return pumpkinPunt();
    case "lavaLeap": return lavaLeap();
    case "meteorDodge": return meteorDodge();
    case "cliffHopper": return cliffHopper();
    default: return bubbleGulp();
  }
}
