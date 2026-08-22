// ─── World themes: background, floor & ambience per world ──────────────────

export interface ThemeFrame {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  t: number;          // seconds
  floorY: number;     // px y of the ground line
}

export interface FxState {
  shots: { x: number; y: number; vx: number; vy: number; life: number }[];
  lastShot: number;
  lastFly: number;   // dino: pterodactyl flyby timer
  flyX: number;
  fly2: { last: number; x: number };  // ocean: whale · space: comet · farm: balloon · dino: sauropod
  fly3: { last: number; x: number };  // farm: bird flock · space: satellite
  sparks: { x: number; y: number; vx: number; vy: number; life: number }[]; // dino lava sparks
}

export const newFxState = (): FxState => ({
  shots: [], lastShot: 0, lastFly: 0, flyX: -0.2,
  fly2: { last: 0, x: -0.3 }, fly3: { last: 5, x: -0.25 }, sparks: [],
});

/** Soft vignette — the AAA finishing touch on every world. */
function vignette(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.42, W / 2, H * 0.55, Math.max(W, H) * 0.78);
  v.addColorStop(0, "rgba(10,10,30,0)");
  v.addColorStop(1, "rgba(10,10,30,0.16)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

export function floorRatio(worldId: string): number {
  if (worldId === "space") return 0.86;
  if (worldId === "farm") return 0.8;
  if (worldId === "dino") return 0.84;
  return 0.88;
}

/* ─────────────────────────── OCEAN ─────────────────────────────────────── */

export function drawOcean({ ctx, W, H, t, floorY }: ThemeFrame, fx: FxState, dt: number) {
  /* water gradient */
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#38c6e8");
  g.addColorStop(0.45, "#0f8fd0");
  g.addColorStop(1, "#0a4d8f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  /* surface shimmer */
  const surf = ctx.createLinearGradient(0, 0, 0, 46);
  surf.addColorStop(0, "rgba(235,255,250,0.5)");
  surf.addColorStop(1, "rgba(235,255,250,0)");
  ctx.fillStyle = surf;
  ctx.fillRect(0, 0, W, 46);
  ctx.save();
  ctx.globalAlpha = 0.25 + Math.sin(t * 1.4) * 0.08;
  ctx.fillStyle = "#eafffb";
  for (let i = 0; i < 5; i++) {
    const hx = ((t * 24 + i * 320) % (W + 300)) - 150;
    ctx.beginPath();
    ctx.ellipse(hx, 12 + Math.sin(t * 2 + i * 1.3) * 5, 130, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /* light rays */
  ctx.save();
  ctx.globalAlpha = 0.1 + Math.sin(t * 0.5) * 0.03;
  ctx.fillStyle = "#eafffb";
  for (let i = 0; i < 4; i++) {
    const cx = W * (0.15 + i * 0.24) + Math.sin(t * 0.12 + i) * 40;
    ctx.beginPath();
    ctx.moveTo(cx - 26, -20);
    ctx.lineTo(cx + 26, -20);
    ctx.lineTo(cx + 110, H * 0.75);
    ctx.lineTo(cx - 110, H * 0.75);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  /* marine snow — tiny drifting plankton */
  ctx.save();
  ctx.fillStyle = "rgba(235,255,250,0.35)";
  for (let i = 0; i < 34; i++) {
    const px = (((i * 283) % 1000) / 1000) * W + Math.sin(t * 0.4 + i * 1.7) * 18;
    const py = (((i * 619 + t * 14) % 1000) / 1000) * floorY;
    ctx.beginPath();
    ctx.arc(px, py, 0.9 + (i % 3) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /* distant fish silhouettes */
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = "#063a63";
  for (let i = 0; i < 3; i++) {
    const px = ((t * (8 + i * 5) + i * 300) % (W + 240)) - 120;
    const py = H * (0.22 + i * 0.14) + Math.sin(t * 0.6 + i * 2) * 14;
    const s = 26 + i * 12;
    ctx.beginPath();
    ctx.ellipse(px, py, s, s * 0.45, 0, 0, Math.PI * 2);
    ctx.moveTo(px - s, py);
    ctx.lineTo(px - s - s * 0.6, py - s * 0.35);
    ctx.lineTo(px - s - s * 0.6, py + s * 0.35);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  /* schooling minnows — a shimmering ribbon of tiny fish */
  ctx.save();
  ctx.fillStyle = "rgba(200,235,255,0.4)";
  const schoolX = ((t * 26) % (W + 500)) - 250;
  for (let i = 0; i < 12; i++) {
    const mx = schoolX + (i % 4) * 26 - Math.floor(i / 4) * 14;
    const my = H * 0.3 + Math.floor(i / 4) * 18 + Math.sin(t * 2.2 + i * 0.9) * 10;
    if (mx < -20 || mx > W + 20) continue;
    ctx.beginPath();
    ctx.ellipse(mx, my, 6, 2.4, Math.sin(t * 3 + i) * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /* whale flyby every ~19s — huge, slow, dreamy */
  if (t - fx.fly2.last > 19) { fx.fly2.last = t; fx.fly2.x = 1.35; }
  if (fx.fly2.x > -0.5) {
    fx.fly2.x -= dt * 0.085;
    const wx = fx.fly2.x * W;
    const wy = H * (0.34 + Math.sin(t * 0.4) * 0.04);
    const ws = Math.min(W, H) * 0.16;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#04294a";
    ctx.translate(wx, wy);
    ctx.beginPath(); // body
    ctx.ellipse(0, 0, ws * 1.5, ws * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); // tail fluke
    const tailWag = Math.sin(t * 1.1) * ws * 0.12;
    ctx.moveTo(-ws * 1.4, 0);
    ctx.quadraticCurveTo(-ws * 1.9, -ws * 0.4 + tailWag, -ws * 2.1, -ws * 0.5 + tailWag);
    ctx.quadraticCurveTo(-ws * 1.95, tailWag, -ws * 2.1, ws * 0.5 + tailWag);
    ctx.quadraticCurveTo(-ws * 1.9, ws * 0.4 + tailWag, -ws * 1.4, 0);
    ctx.fill();
    ctx.beginPath(); // pectoral fin
    ctx.ellipse(ws * 0.2, ws * 0.42, ws * 0.45, ws * 0.14, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* back kelp forest — darker, taller, slower (parallax depth) */
  ctx.save();
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 5; i++) {
    const bx = ((i * 457 + 200) % 1000) / 1000 * W;
    const hgt = H * 0.3 + (i % 3) * H * 0.08;
    const sway = Math.sin(t * 0.6 + i * 2.1) * 18;
    ctx.strokeStyle = i % 2 ? "#0d5c46" : "#0a4a3a";
    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bx, floorY + 10);
    ctx.quadraticCurveTo(bx + sway * 0.3, floorY - hgt * 0.5, bx + sway, floorY - hgt);
    ctx.stroke();
    /* kelp fronds */
    ctx.lineWidth = 6;
    for (let f = 1; f <= 3; f++) {
      const fy2 = floorY - hgt * (f / 3.5);
      const fx4 = bx + sway * (f / 3.5);
      ctx.beginPath();
      ctx.moveTo(fx4, fy2);
      ctx.quadraticCurveTo(fx4 + 14 + sway * 0.2, fy2 - 8, fx4 + 26 + sway * 0.3, fy2 - 4);
      ctx.stroke();
    }
  }
  ctx.restore();

  /* sand floor */
  const sg = ctx.createLinearGradient(0, floorY - 10, 0, H);
  sg.addColorStop(0, "#f2d8a0");
  sg.addColorStop(1, "#d9b271");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(0, floorY + Math.sin(t * 0.4) * 3);
  for (let x = 0; x <= W; x += 40) {
    ctx.lineTo(x, floorY + Math.sin(x * 0.01 + 1.5) * 8);
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  /* pebbles */
  ctx.fillStyle = "rgba(120,84,40,0.25)";
  for (let i = 0; i < 22; i++) {
    const px = ((i * 167) % 1000) / 1000 * W;
    const py = floorY + 14 + ((i * 89) % 40);
    ctx.beginPath();
    ctx.ellipse(px, py, 3 + (i % 4), 2 + (i % 3), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* caustic light dapples */
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = "#fffbe8";
  for (let i = 0; i < 5; i++) {
    const cx2 = W * ((i * 0.23 + 0.1) % 1) + Math.sin(t * 0.7 + i * 2.4) * 60;
    const cy2 = floorY + 18 + (i % 2) * 22;
    ctx.beginPath();
    ctx.ellipse(cx2, cy2, 90 + Math.sin(t + i) * 26, 13 + Math.cos(t * 0.8 + i) * 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /* coral clusters on the sand */
  const coral = (cx: number, s: number, col: string, seed: number) => {
    ctx.save();
    ctx.translate(cx, floorY + 4);
    ctx.strokeStyle = col;
    ctx.lineCap = "round";
    for (let b = 0; b < 5; b++) {
      const a = -Math.PI / 2 + (b - 2) * 0.42;
      const len = s * (0.7 + ((b * 37 + seed * 11) % 10) / 22);
      const wob = Math.sin(t * 0.9 + seed + b) * 0.06;
      ctx.lineWidth = s * 0.16;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(
        Math.cos(a + wob) * len * 0.5, Math.sin(a + wob) * len * 0.55,
        Math.cos(a + wob) * len, Math.sin(a + wob) * len
      );
      ctx.stroke();
      ctx.beginPath(); // branch nub
      ctx.arc(Math.cos(a + wob) * len, Math.sin(a + wob) * len, s * 0.11, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    }
    ctx.restore();
  };
  coral(W * 0.12, 34, "#ff8fb2", 1);
  coral(W * 0.34, 26, "#c79bff", 2);
  coral(W * 0.68, 38, "#ff9d76", 3);
  coral(W * 0.9, 28, "#ffd65a", 4);

  /* bubble vents — streams rising from the sand */
  ctx.save();
  for (let v = 0; v < 3; v++) {
    const vx2 = W * (0.2 + v * 0.31);
    for (let i = 0; i < 6; i++) {
      const p = ((t * (0.16 + v * 0.03) + i / 6 + v * 0.37) % 1);
      const byy = floorY - p * (floorY * 0.75);
      const bxx = vx2 + Math.sin(t * 2 + i * 2.2 + p * 9) * (4 + p * 14);
      ctx.globalAlpha = (1 - p * 0.7) * 0.55;
      ctx.strokeStyle = "#d8f6ff";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(bxx, byy, 2 + p * 3.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  /* seaweed */
  for (let i = 0; i < 6; i++) {
    const bx = ((i * 313 + 80) % 1000) / 1000 * W;
    const hgt = 50 + (i % 3) * 28;
    const sway = Math.sin(t * 1.1 + i * 1.7) * 12;
    ctx.strokeStyle = i % 2 ? "#1d9e6c" : "#157a52";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bx, floorY + 6);
    ctx.quadraticCurveTo(bx + sway * 0.4, floorY - hgt * 0.55, bx + sway, floorY - hgt);
    ctx.stroke();
  }

  vignette(ctx, W, H);
}

/* ─────────────────────────── SPACE ─────────────────────────────────────── */

export function drawSpace({ ctx, W, H, t, floorY }: ThemeFrame, fx: FxState, dt: number) {
  /* deep space gradient */
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#050820");
  g.addColorStop(0.5, "#151040");
  g.addColorStop(1, "#2b1455");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  /* nebulas */
  const nebs = [
    { x: 0.22, y: 0.28, r: 0.42, c: "rgba(139,70,199,0.20)", s: 0.9 },
    { x: 0.75, y: 0.2, r: 0.36, c: "rgba(0,194,185,0.14)", s: 1.3 },
    { x: 0.55, y: 0.6, r: 0.45, c: "rgba(251,102,229,0.10)", s: 0.7 },
  ];
  for (const n of nebs) {
    const nx = (n.x + Math.sin(t * 0.05 * n.s) * 0.03) * W;
    const ny = (n.y + Math.cos(t * 0.04 * n.s) * 0.02) * H;
    const nr = n.r * Math.min(W, H);
    const rg = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
    rg.addColorStop(0, n.c);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
  }

  /* starfield: 3 parallax layers, twinkling — deterministic scatter via LCG */
  for (let layer = 0; layer < 3; layer++) {
    const n = 52 - layer * 10;
    let s = 1237 + layer * 6151; // LCG state
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < n; i++) {
      const seed = i * 137 + layer * 911;
      const sx = rnd() * W;
      const sy = rnd() * floorY * 0.96;
      const tw = 0.55 + 0.45 * Math.abs(Math.sin(t * (0.6 + layer * 0.35) + seed));
      ctx.globalAlpha = tw * (0.55 + layer * 0.22);
      ctx.fillStyle = layer === 2 ? "#ffe9a8" : "#ffffff";
      const r = 0.9 + layer * 0.7 + (i % 3) * 0.35;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      if (layer === 2 && i % 5 === 0) {
        ctx.globalAlpha = tw * 0.6;
        ctx.strokeStyle = "#fff7d6";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx - r * 4.5, sy);
        ctx.lineTo(sx + r * 4.5, sy);
        ctx.moveTo(sx, sy - r * 4.5);
        ctx.lineTo(sx, sy + r * 4.5);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;

  /* faint spiral galaxy */
  ctx.save();
  ctx.translate(W * 0.4, H * 0.14);
  ctx.rotate(t * 0.02);
  for (let arm = 0; arm < 2; arm++) {
    ctx.rotate(Math.PI);
    ctx.strokeStyle = `rgba(200,180,255,${0.1 + Math.sin(t * 0.5) * 0.03})`;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2.4; a += 0.25) {
      const rr = 4 + a * 7;
      const gx = Math.cos(a) * rr, gy = Math.sin(a) * rr * 0.5;
      if (a === 0) ctx.moveTo(gx, gy); else ctx.lineTo(gx, gy);
    }
    ctx.stroke();
  }
  ctx.restore();

  /* aurora ribbons dancing over the moon horizon */
  ctx.save();
  for (let band = 0; band < 3; band++) {
    const cols = ["rgba(64,224,190,", "rgba(139,146,255,", "rgba(251,160,229,"];
    ctx.strokeStyle = cols[band] + (0.16 - band * 0.03) + ")";
    ctx.lineWidth = 16 - band * 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let x = 0; x <= W; x += 24) {
      const ay = floorY - 34 - band * 22 + Math.sin(t * 0.7 + x * 0.008 + band * 2.2) * 14;
      if (x === 0) ctx.moveTo(x, ay); else ctx.lineTo(x, ay);
    }
    ctx.stroke();
  }
  ctx.restore();

  /* ringed planet, top right */
  const px = W * 0.82, py = H * 0.18, pr = Math.min(W, H) * 0.085;
  ctx.save();
  ctx.translate(px, py);
  ctx.strokeStyle = "rgba(230,200,255,0.4)";
  ctx.lineWidth = pr * 0.14;
  ctx.beginPath();
  ctx.ellipse(0, 0, pr * 1.9, pr * 0.55, -0.35, Math.PI * 0.95, Math.PI * 1.95);
  ctx.stroke();
  const pg = ctx.createLinearGradient(-pr, -pr, pr, pr);
  pg.addColorStop(0, "#c084fc");
  pg.addColorStop(0.55, "#8b46c7");
  pg.addColorStop(1, "#5b21b6");
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(0, 0, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, pr, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#e9d5ff";
  ctx.fillRect(-pr, -pr * 0.25 + Math.sin(t * 0.3) * 2, pr * 2, pr * 0.28);
  ctx.restore();
  ctx.strokeStyle = "rgba(240,220,255,0.65)";
  ctx.lineWidth = pr * 0.14;
  ctx.beginPath();
  ctx.ellipse(0, 0, pr * 1.9, pr * 0.55, -0.35, Math.PI * 1.05, Math.PI * 0.85, true);
  ctx.stroke();
  ctx.restore();

  /* tiny orange planet, left */
  const qx = W * 0.1, qy = H * 0.42, qr = Math.min(W, H) * 0.038;
  const qg = ctx.createLinearGradient(qx - qr, qy - qr, qx + qr, qy + qr);
  qg.addColorStop(0, "#ffb84d");
  qg.addColorStop(1, "#e2603a");
  ctx.fillStyle = qg;
  ctx.beginPath();
  ctx.arc(qx, qy + Math.sin(t * 0.5) * 4, qr, 0, Math.PI * 2);
  ctx.fill();

  /* shooting stars */
  if (t - fx.lastShot > 5 + (fx.lastShot % 3) && fx.shots.length < 2) {
    fx.lastShot = t;
    const fromLeft = Math.random() > 0.5;
    fx.shots.push({
      x: fromLeft ? -40 : W * (0.4 + Math.random() * 0.5),
      y: H * (0.05 + Math.random() * 0.25),
      vx: (fromLeft ? 1 : -0.6) * (420 + Math.random() * 200),
      vy: 130 + Math.random() * 90,
      life: 1,
    });
  }
  for (let i = fx.shots.length - 1; i >= 0; i--) {
    const s = fx.shots[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt * 0.9;
    if (s.life <= 0 || s.x > W + 60 || s.y > floorY) { fx.shots.splice(i, 1); continue; }
    const tail = 90 * s.life;
    const ang = Math.atan2(s.vy, s.vx);
    const tg = ctx.createLinearGradient(s.x, s.y, s.x - Math.cos(ang) * tail, s.y - Math.sin(ang) * tail);
    tg.addColorStop(0, `rgba(255,255,255,${0.9 * s.life})`);
    tg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = tg;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - Math.cos(ang) * tail, s.y - Math.sin(ang) * tail);
    ctx.stroke();
  }

  /* comet flyby every ~17s — bright head, long glowing tail */
  if (t - fx.fly2.last > 17) { fx.fly2.last = t; fx.fly2.x = -0.25; }
  if (fx.fly2.x < 1.4) {
    fx.fly2.x += dt * 0.14;
    const cx4 = fx.fly2.x * W;
    const cy4 = H * 0.1 + fx.fly2.x * H * 0.22;
    ctx.save();
    const tail = ctx.createLinearGradient(cx4, cy4, cx4 - 150, cy4 - 66);
    tail.addColorStop(0, "rgba(180,240,255,0.85)");
    tail.addColorStop(1, "rgba(180,240,255,0)");
    ctx.strokeStyle = tail;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx4, cy4);
    ctx.lineTo(cx4 - 150, cy4 - 66);
    ctx.stroke();
    const cg2 = ctx.createRadialGradient(cx4, cy4, 0, cx4, cy4, 16);
    cg2.addColorStop(0, "#ffffff");
    cg2.addColorStop(0.4, "rgba(190,240,255,0.9)");
    cg2.addColorStop(1, "rgba(190,240,255,0)");
    ctx.fillStyle = cg2;
    ctx.beginPath();
    ctx.arc(cx4, cy4, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* satellite drifting across the top, blinking beacon */
  if (t - fx.fly3.last > 21) { fx.fly3.last = t; fx.fly3.x = -0.15; }
  if (fx.fly3.x < 1.2) {
    fx.fly3.x += dt * 0.05;
    const sx4 = fx.fly3.x * W;
    const sy4 = H * (0.3 + Math.sin(t * 0.3) * 0.02);
    ctx.save();
    ctx.translate(sx4, sy4);
    ctx.rotate(0.2);
    ctx.fillStyle = "#aab4d4";
    ctx.fillRect(-6, -5, 12, 10);
    ctx.fillStyle = "#4d6fb3";
    ctx.fillRect(-24, -3, 14, 6);
    ctx.fillRect(10, -3, 14, 6);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-24, -3, 14, 6);
    ctx.strokeRect(10, -3, 14, 6);
    if (Math.sin(t * 6) > 0.6) {
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(0, -8, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* moon floor */
  const mg = ctx.createLinearGradient(0, floorY - 8, 0, H);
  mg.addColorStop(0, "#d9d4f0");
  mg.addColorStop(1, "#9d94c7");
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  for (let x = 0; x <= W; x += 50) {
    ctx.lineTo(x, floorY + Math.sin(x * 0.008 + 2) * 6);
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  /* horizon glow */
  ctx.save();
  ctx.globalAlpha = 0.35 + Math.sin(t * 0.8) * 0.08;
  const hg = ctx.createLinearGradient(0, floorY - 26, 0, floorY + 6);
  hg.addColorStop(0, "rgba(200,180,255,0)");
  hg.addColorStop(1, "rgba(220,205,255,0.6)");
  ctx.fillStyle = hg;
  ctx.fillRect(0, floorY - 26, W, 32);
  ctx.restore();
  /* craters */
  ctx.fillStyle = "rgba(90,80,140,0.28)";
  for (let i = 0; i < 7; i++) {
    const cx3 = ((i * 379 + 60) % 1000) / 1000 * W;
    const cy3 = floorY + 16 + ((i * 61) % 42);
    const cr = 7 + (i % 4) * 5;
    ctx.beginPath();
    ctx.ellipse(cx3, cy3, cr, cr * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.ellipse(cx3 - cr * 0.25, cy3 - cr * 0.18, cr * 0.5, cr * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(90,80,140,0.28)";
  }

  vignette(ctx, W, H);
}


/* ─────────────────────────── SUNNY FARM ────────────────────────────────── */

export function drawFarm({ ctx, W, H, t, floorY }: ThemeFrame, fx: FxState, dt: number) {
  /* sky */
  const sky = ctx.createLinearGradient(0, 0, 0, floorY);
  sky.addColorStop(0, "#6ec3f7");
  sky.addColorStop(0.6, "#a8dcf5");
  sky.addColorStop(1, "#fdf3c8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, floorY + 2);

  /* sun with slow-breathing rays */
  const sunX = W * 0.14, sunY = H * 0.16, sunR = Math.min(W, H) * 0.075;
  ctx.save();
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, sunR * 3.2);
  glow.addColorStop(0, "rgba(255,226,130,0.55)");
  glow.addColorStop(1, "rgba(255,226,130,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - sunR * 3.2, sunY - sunR * 3.2, sunR * 6.4, sunR * 6.4);
  ctx.translate(sunX, sunY);
  ctx.rotate(Math.sin(t * 0.12) * 0.08);
  ctx.strokeStyle = "rgba(255,214,90,0.85)";
  ctx.lineWidth = sunR * 0.14;
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const breathe = 1 + Math.sin(t * 1.2 + i) * 0.12;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * sunR * 1.35, Math.sin(a) * sunR * 1.35);
    ctx.lineTo(Math.cos(a) * sunR * 1.8 * breathe, Math.sin(a) * sunR * 1.8 * breathe);
    ctx.stroke();
  }
  const sg = ctx.createRadialGradient(-sunR * 0.3, -sunR * 0.3, sunR * 0.1, 0, 0, sunR);
  sg.addColorStop(0, "#fff3b0");
  sg.addColorStop(1, "#ffc93c");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(0, 0, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* drifting puffy clouds */
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  for (let i = 0; i < 4; i++) {
    const cw = 90 + (i % 3) * 34;
    const cx = ((t * (7 + i * 2.5) + i * 373) % (W + cw * 4)) - cw * 2;
    const cy = H * (0.08 + (i % 3) * 0.075);
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw * 0.55, cw * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - cw * 0.38, cy + cw * 0.07, cw * 0.34, cw * 0.21, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + cw * 0.4, cy + cw * 0.06, cw * 0.36, cw * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /* bird flock in V-formation every ~13s */
  if (t - fx.fly3.last > 13) { fx.fly3.last = t; fx.fly3.x = -0.15; }
  if (fx.fly3.x < 1.25) {
    fx.fly3.x += dt * 0.14;
    ctx.save();
    ctx.strokeStyle = "rgba(60,60,80,0.75)";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    for (let b = 0; b < 5; b++) {
      const bx2 = fx.fly3.x * W - Math.abs(b - 2) * 26;
      const by2 = H * 0.14 + (b - 2) * (b - 2) * 7 + Math.abs(b - 2) * 13;
      const flap = Math.sin(t * 9 + b * 1.4) * 4;
      ctx.beginPath();
      ctx.moveTo(bx2 - 8, by2 - flap);
      ctx.quadraticCurveTo(bx2, by2 + 3, bx2 + 8, by2 - flap);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* hot-air balloon drifting every ~23s */
  if (t - fx.fly2.last > 23) { fx.fly2.last = t; fx.fly2.x = 1.25; }
  if (fx.fly2.x > -0.3) {
    fx.fly2.x -= dt * 0.035;
    const bx3 = fx.fly2.x * W;
    const by3 = H * (0.22 + Math.sin(t * 0.5) * 0.02);
    const br = Math.min(W, H) * 0.045;
    ctx.save();
    ctx.translate(bx3, by3);
    for (let s = -2; s <= 2; s++) { // striped balloon
      ctx.fillStyle = s % 2 ? "#ff8fa3" : "#ffd65a";
      ctx.beginPath();
      ctx.ellipse(0, 0, br * (1 - Math.abs(s) * 0.16), br * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#8a5a2b";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-br * 0.5, br * 0.9); ctx.lineTo(-br * 0.28, br * 1.5);
    ctx.moveTo(br * 0.5, br * 0.9); ctx.lineTo(br * 0.28, br * 1.5);
    ctx.stroke();
    ctx.fillStyle = "#a06a35";
    ctx.fillRect(-br * 0.32, br * 1.5, br * 0.64, br * 0.45);
    ctx.restore();
  }

  /* rolling hills (far, then near) */
  ctx.fillStyle = "#b5e388";
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.quadraticCurveTo(W * 0.25, floorY - H * 0.16, W * 0.55, floorY - H * 0.03);
  ctx.quadraticCurveTo(W * 0.8, floorY + H * 0.02, W, floorY - H * 0.09);
  ctx.lineTo(W, floorY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8fd35f";
  ctx.beginPath();
  ctx.moveTo(0, floorY - H * 0.02);
  ctx.quadraticCurveTo(W * 0.35, floorY - H * 0.12, W * 0.7, floorY);
  ctx.quadraticCurveTo(W * 0.85, floorY + H * 0.02, W, floorY - H * 0.015);
  ctx.lineTo(W, floorY);
  ctx.closePath();
  ctx.fill();

  /* windmill on the left hill — blades slowly turning */
  const wmx = W * 0.1, wmy = floorY - H * 0.075, wmH = Math.min(W, H) * 0.19;
  ctx.save();
  ctx.translate(wmx, wmy);
  ctx.fillStyle = "#f4e3c2";
  ctx.beginPath(); // tapered tower
  ctx.moveTo(-wmH * 0.16, 0);
  ctx.lineTo(-wmH * 0.09, -wmH);
  ctx.lineTo(wmH * 0.09, -wmH);
  ctx.lineTo(wmH * 0.16, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c25b4a"; // cap
  ctx.beginPath();
  ctx.moveTo(-wmH * 0.13, -wmH);
  ctx.lineTo(0, -wmH * 1.22);
  ctx.lineTo(wmH * 0.13, -wmH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8a5a2b"; // door
  ctx.fillRect(-wmH * 0.05, -wmH * 0.22, wmH * 0.1, wmH * 0.22);
  ctx.translate(0, -wmH * 0.92); // hub
  ctx.rotate(t * 0.7);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#d9c4a5";
  ctx.lineWidth = 1.5;
  for (let b = 0; b < 4; b++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(wmH * 0.09, -wmH * 0.14);
    ctx.lineTo(wmH * 0.34, -wmH * 0.4);
    ctx.lineTo(wmH * 0.24, -wmH * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = "#c25b4a";
  ctx.beginPath();
  ctx.arc(0, 0, wmH * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* barn on the right hill */
  const bx = W * 0.86, by = floorY - H * 0.055, bw = Math.min(W, H) * 0.16, bh = bw * 0.72;
  ctx.save();
  ctx.translate(bx, by);
  ctx.fillStyle = "#e05545";
  ctx.fillRect(-bw / 2, -bh, bw, bh);
  ctx.beginPath(); // gambrel roof
  ctx.moveTo(-bw / 2 - bw * 0.07, -bh);
  ctx.lineTo(-bw * 0.28, -bh - bw * 0.34);
  ctx.lineTo(bw * 0.28, -bh - bw * 0.34);
  ctx.lineTo(bw / 2 + bw * 0.07, -bh);
  ctx.closePath();
  ctx.fillStyle = "#a33b30";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = bw * 0.045;
  ctx.strokeRect(-bw * 0.16, -bh * 0.55, bw * 0.32, bh * 0.55); // door
  ctx.beginPath();
  ctx.moveTo(-bw * 0.16, -bh * 0.55);
  ctx.lineTo(bw * 0.16, 0);
  ctx.moveTo(bw * 0.16, -bh * 0.55);
  ctx.lineTo(-bw * 0.16, 0);
  ctx.stroke();
  ctx.restore();

  /* grass floor */
  const grass = ctx.createLinearGradient(0, floorY, 0, H);
  grass.addColorStop(0, "#7cc24a");
  grass.addColorStop(1, "#4e9b33");
  ctx.fillStyle = grass;
  ctx.fillRect(0, floorY, W, H - floorY);
  /* grass ticks + tiny flowers */
  ctx.strokeStyle = "rgba(46,125,34,0.55)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    const gx = ((i * 173) % 1000) / 1000 * W;
    const gy = floorY + 8 + ((i * 271) % 1000) / 1000 * (H - floorY - 16);
    const sway = Math.sin(t * 1.8 + i) * 2.2;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx + sway, gy - 5, gx + sway * 1.6, gy - 8);
    ctx.stroke();
  }
  const petalCols = ["#ff8fb2", "#ffd65a", "#ffffff", "#c79bff"];
  for (let i = 0; i < 14; i++) {
    const fx2 = ((i * 397 + 61) % 1000) / 1000 * W;
    const fy = floorY + 10 + ((i * 521 + 97) % 1000) / 1000 * (H - floorY - 20);
    const pr = 2.6 + (i % 3);
    ctx.fillStyle = petalCols[i % 4];
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2 + i;
      ctx.beginPath();
      ctx.arc(fx2 + Math.cos(a) * pr, fy + Math.sin(a) * pr, pr * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffb020";
    ctx.beginPath();
    ctx.arc(fx2, fy, pr * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  /* floating dandelion seeds */
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (let i = 0; i < 12; i++) {
    const sx = (((i * 331) % 1000) / 1000) * W + Math.sin(t * 0.5 + i * 1.9) * 26;
    const sy = (((i * 197 + t * 9) % 1000) / 1000) * floorY;
    ctx.beginPath();
    ctx.arc(sx, sy, 1.6 + (i % 2) * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /* wind gust ripples sweeping across the grass */
  ctx.save();
  for (let w = 0; w < 2; w++) {
    const gx2 = ((t * 90 + w * W * 0.6) % (W * 1.6)) - W * 0.3;
    const gust = ctx.createLinearGradient(gx2 - 90, 0, gx2 + 90, 0);
    gust.addColorStop(0, "rgba(255,255,255,0)");
    gust.addColorStop(0.5, "rgba(255,255,220,0.14)");
    gust.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gust;
    ctx.fillRect(gx2 - 90, floorY, 180, H - floorY);
  }
  ctx.restore();

  /* butterflies fluttering over the meadow */
  const bCols = ["#ff8fb2", "#c79bff", "#ffd65a"];
  for (let i = 0; i < 3; i++) {
    const bfx = W * (0.2 + i * 0.3) + Math.sin(t * 0.7 + i * 2.6) * W * 0.08;
    const bfy = floorY - 24 - i * 14 + Math.sin(t * 1.7 + i * 1.9) * 16;
    const flap = Math.abs(Math.sin(t * 10 + i * 3)) * 0.8 + 0.2;
    ctx.save();
    ctx.translate(bfx, bfy);
    ctx.fillStyle = bCols[i];
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 5 * flap, -2, 5 * flap, 6.5, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#5a4a3a";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 4);
    ctx.stroke();
    ctx.restore();
  }

  vignette(ctx, W, H);
}

/* ─────────────────────────── DINO ISLAND ───────────────────────────────── */

export function drawDino({ ctx, W, H, t, floorY }: ThemeFrame, fx: FxState, dt: number) {
  /* dusk sky: violet → ember horizon */
  const sky = ctx.createLinearGradient(0, 0, 0, floorY);
  sky.addColorStop(0, "#2d1b4e");
  sky.addColorStop(0.55, "#7c3f61");
  sky.addColorStop(1, "#ff9d5c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, floorY + 2);

  /* early stars up top */
  for (let i = 0; i < 26; i++) {
    const sx = ((i * 389) % 1000) / 1000 * W;
    const sy = ((i * 211) % 1000) / 1000 * floorY * 0.4;
    ctx.globalAlpha = (0.25 + 0.55 * Math.abs(Math.sin(t * 0.8 + i * 2.3))) * 0.8;
    ctx.fillStyle = "#ffe9c4";
    ctx.beginPath();
    ctx.arc(sx, sy, 1 + (i % 3) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* volcano (left) with glowing crater */
  const vx = W * 0.2, vy = floorY, vw = Math.min(W, H) * 0.5, vh = floorY * 0.52;
  ctx.save();
  ctx.fillStyle = "#3f2b45";
  ctx.beginPath();
  ctx.moveTo(vx - vw / 2, vy);
  ctx.lineTo(vx - vw * 0.13, vy - vh);
  ctx.lineTo(vx + vw * 0.13, vy - vh);
  ctx.lineTo(vx + vw / 2, vy);
  ctx.closePath();
  ctx.fill();
  /* lava dribble */
  ctx.fillStyle = "#ff6b35";
  ctx.beginPath();
  ctx.moveTo(vx - vw * 0.13, vy - vh);
  ctx.quadraticCurveTo(vx - vw * 0.05, vy - vh + vh * 0.28 + Math.sin(t * 1.3) * 3, vx - vw * 0.02, vy - vh + vh * 0.34);
  ctx.lineTo(vx + vw * 0.03, vy - vh + vh * 0.2);
  ctx.lineTo(vx + vw * 0.13, vy - vh);
  ctx.closePath();
  ctx.fill();
  /* crater glow */
  const cg = ctx.createRadialGradient(vx, vy - vh, 2, vx, vy - vh, vw * 0.22);
  cg.addColorStop(0, `rgba(255,140,60,${0.75 + Math.sin(t * 2.1) * 0.2})`);
  cg.addColorStop(1, "rgba(255,140,60,0)");
  ctx.fillStyle = cg;
  ctx.fillRect(vx - vw * 0.22, vy - vh - vw * 0.22, vw * 0.44, vw * 0.44);
  /* smoke puffs */
  for (let i = 0; i < 5; i++) {
    const p = ((t * 0.14 + i / 5) % 1);
    ctx.globalAlpha = (1 - p) * 0.35;
    ctx.fillStyle = "#cbb8d4";
    ctx.beginPath();
    ctx.arc(vx + Math.sin(t * 0.7 + i * 2) * (6 + p * 26), vy - vh - p * H * 0.16 - 8, 7 + p * 20, 0, Math.PI * 2);
    ctx.fill();
  }

  /* lava spark fountain — embers arc out of the crater with gravity */
  if (Math.random() < dt * 9 && fx.sparks.length < 26) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
    const sp = 140 + Math.random() * 160;
    fx.sparks.push({ x: vx, y: vy - vh, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 });
  }
  for (let i = fx.sparks.length - 1; i >= 0; i--) {
    const s = fx.sparks[i];
    s.vy += 340 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt * 0.75;
    if (s.life <= 0 || s.y > vy) { fx.sparks.splice(i, 1); continue; }
    ctx.globalAlpha = s.life * 0.95;
    ctx.fillStyle = s.life > 0.5 ? "#ffd65a" : "#ff7a45";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 1.6 + s.life * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  /* warm lava light cast onto the horizon */
  const lavaGlow = ctx.createRadialGradient(vx, floorY, 10, vx, floorY, W * 0.4);
  lavaGlow.addColorStop(0, `rgba(255,120,60,${0.14 + Math.sin(t * 2.1) * 0.04})`);
  lavaGlow.addColorStop(1, "rgba(255,120,60,0)");
  ctx.fillStyle = lavaGlow;
  ctx.fillRect(vx - W * 0.4, floorY - W * 0.4, W * 0.8, W * 0.4);

  /* meteor streaks in the dusk sky */
  if (t - fx.lastShot > 7 + (fx.lastShot % 4) && fx.shots.length < 2) {
    fx.lastShot = t;
    fx.shots.push({
      x: W * (0.35 + Math.random() * 0.6),
      y: H * (0.04 + Math.random() * 0.18),
      vx: -(300 + Math.random() * 160),
      vy: 120 + Math.random() * 70,
      life: 1,
    });
  }
  for (let i = fx.shots.length - 1; i >= 0; i--) {
    const s = fx.shots[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt * 1.1;
    if (s.life <= 0 || s.x < -60) { fx.shots.splice(i, 1); continue; }
    const tail = 70 * s.life;
    const ang = Math.atan2(s.vy, s.vx);
    const mg2 = ctx.createLinearGradient(s.x, s.y, s.x - Math.cos(ang) * tail, s.y - Math.sin(ang) * tail);
    mg2.addColorStop(0, `rgba(255,190,120,${0.85 * s.life})`);
    mg2.addColorStop(1, "rgba(255,190,120,0)");
    ctx.strokeStyle = mg2;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - Math.cos(ang) * tail, s.y - Math.sin(ang) * tail);
    ctx.stroke();
  }

  /* palm silhouettes */
  const palm = (px: number, ph: number, lean: number, seed: number) => {
    ctx.save();
    ctx.translate(px, floorY);
    ctx.strokeStyle = "#241536";
    ctx.fillStyle = "#241536";
    ctx.lineWidth = ph * 0.09;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(lean * ph * 0.25, -ph * 0.55, lean * ph * 0.4, -ph);
    ctx.stroke();
    const topx = lean * ph * 0.4, topy = -ph;
    for (let f = 0; f < 6; f++) {
      const a = (f / 6) * Math.PI * 2 + seed + Math.sin(t * 0.9 + seed) * 0.06;
      const fl = ph * 0.42;
      ctx.beginPath();
      ctx.moveTo(topx, topy);
      ctx.quadraticCurveTo(
        topx + Math.cos(a) * fl * 0.6, topy + Math.sin(a) * fl * 0.35 - fl * 0.18,
        topx + Math.cos(a) * fl, topy + Math.sin(a) * fl * 0.55 + fl * 0.12
      );
      ctx.lineWidth = ph * 0.055;
      ctx.stroke();
    }
    ctx.restore();
  };
  palm(W * 0.62, H * 0.2, 1, 0.4);
  palm(W * 0.78, H * 0.26, -1, 2.1);
  palm(W * 0.94, H * 0.17, 1, 4.4);

  /* pterodactyl flyby every ~11s */
  if (t - fx.lastFly > 11) { fx.lastFly = t; fx.flyX = -0.15; }
  if (fx.flyX < 1.2) {
    fx.flyX += dt * 0.09;
    const pxx = fx.flyX * W;
    const pyy = H * (0.16 + Math.sin(t * 0.7) * 0.03);
    const flap = Math.sin(t * 7) * 0.5;
    ctx.save();
    ctx.translate(pxx, pyy);
    ctx.strokeStyle = "#241536";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath(); // left wing
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-22, -14 - flap * 10, -44, -6 - flap * 16);
    ctx.moveTo(0, 0); // right wing
    ctx.quadraticCurveTo(22, -14 - flap * 10, 44, -6 - flap * 16);
    ctx.moveTo(0, 0); // body + beak
    ctx.quadraticCurveTo(10, 4, 20, 2);
    ctx.stroke();
    ctx.restore();
  }

  /* sauropod silhouette ambling past behind the jungle, every ~26s */
  if (t - fx.fly2.last > 26) { fx.fly2.last = t; fx.fly2.x = -0.35; }
  if (fx.fly2.x < 1.35) {
    fx.fly2.x += dt * 0.05;
    const dx4 = fx.fly2.x * W;
    const dy4 = floorY + 2;
    const ds = Math.min(W, H) * 0.16;
    const bob = Math.sin(t * 1.6) * ds * 0.02;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#1c0f2e";
    ctx.translate(dx4, dy4 + bob);
    ctx.beginPath(); // body
    ctx.ellipse(0, -ds * 0.55, ds * 0.85, ds * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); // long neck rising to the right
    ctx.moveTo(ds * 0.55, -ds * 0.7);
    ctx.quadraticCurveTo(ds * 0.85, -ds * 1.3, ds * 1.15, -ds * 1.55);
    ctx.quadraticCurveTo(ds * 1.3, -ds * 1.65, ds * 1.38, -ds * 1.6);
    ctx.quadraticCurveTo(ds * 1.3, -ds * 1.45, ds * 1.05, -ds * 1.28);
    ctx.quadraticCurveTo(ds * 0.8, -ds * 1.0, ds * 0.72, -ds * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); // tail tapering left
    ctx.moveTo(-ds * 0.8, -ds * 0.6);
    ctx.quadraticCurveTo(-ds * 1.5, -ds * 0.55 + Math.sin(t * 1.6) * 4, -ds * 1.9, -ds * 0.3);
    ctx.quadraticCurveTo(-ds * 1.4, -ds * 0.35, -ds * 0.8, -ds * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-ds * 0.5, -ds * 0.35, ds * 0.16, ds * 0.4); // legs
    ctx.fillRect(ds * 0.28, -ds * 0.35, ds * 0.16, ds * 0.4);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* jungle floor */
  const gr = ctx.createLinearGradient(0, floorY, 0, H);
  gr.addColorStop(0, "#274d33");
  gr.addColorStop(1, "#122a1b");
  ctx.fillStyle = gr;
  ctx.fillRect(0, floorY, W, H - floorY);
  /* ferns */
  ctx.strokeStyle = "rgba(46,120,70,0.8)";
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 16; i++) {
    const fx3 = ((i * 269 + 31) % 1000) / 1000 * W;
    const fy = floorY + 12 + ((i * 431 + 53) % 1000) / 1000 * (H - floorY - 22);
    const sway = Math.sin(t * 1.1 + i * 1.3) * 0.12;
    for (let f = -1; f <= 1; f++) {
      ctx.beginPath();
      ctx.moveTo(fx3, fy);
      ctx.quadraticCurveTo(fx3 + f * 7 + sway * 12, fy - 9, fx3 + f * 12 + sway * 20, fy - 15);
      ctx.stroke();
    }
  }

  /* drifting embers */
  ctx.save();
  for (let i = 0; i < 14; i++) {
    const p = ((t * 0.06 + i / 14) % 1);
    const ex = (((i * 443) % 1000) / 1000) * W + Math.sin(t * 0.8 + i * 2.7) * 22;
    const ey = floorY - p * floorY * 0.7;
    ctx.globalAlpha = (1 - p) * 0.7;
    ctx.fillStyle = i % 3 ? "#ffb35c" : "#ff7a45";
    ctx.beginPath();
    ctx.arc(ex, ey, 1.4 + (i % 3) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  /* ground mist drifting through the jungle */
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const mx2 = ((t * (6 + i * 2.2) + i * 400) % (W + 500)) - 250;
    const my2 = floorY + 8 + i * 12;
    const mist = ctx.createRadialGradient(mx2, my2, 0, mx2, my2, 130);
    mist.addColorStop(0, "rgba(210,190,230,0.10)");
    mist.addColorStop(1, "rgba(210,190,230,0)");
    ctx.fillStyle = mist;
    ctx.beginPath();
    ctx.ellipse(mx2, my2, 130, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /* fireflies blinking over the ferns */
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const fx5 = (((i * 353) % 1000) / 1000) * W + Math.sin(t * 0.6 + i * 2.4) * 30;
    const fy3 = floorY - 10 - ((i * 173) % 60) + Math.sin(t * 1.2 + i) * 10;
    const blink = Math.max(0, Math.sin(t * 1.8 + i * 2.7));
    if (blink < 0.35) continue;
    ctx.globalAlpha = (blink - 0.35) * 1.2;
    const fg = ctx.createRadialGradient(fx5, fy3, 0, fx5, fy3, 7);
    fg.addColorStop(0, "#e8ff9a");
    fg.addColorStop(1, "rgba(232,255,154,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(fx5, fy3, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  vignette(ctx, W, H);
}
