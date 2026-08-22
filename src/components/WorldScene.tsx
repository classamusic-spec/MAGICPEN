import { useEffect, useMemo, useRef, useState } from "react";
import type { Creature } from "@/lib/types";
import { kindById, BEHAVIOR_COPY } from "@/lib/creatures";
import { sfxBubble, sfxPop, sfxSplash, sfxTap, setMuted, isMuted, sfxHappy, sfxMagic } from "@/lib/audio";
import { drawOcean, drawSpace, drawFarm, drawDino, newFxState, floorRatio } from "./world/themes";
import { artSprite, onArtLoaded, stickerizeImage } from "@/lib/polish";
import { bakeCrayonSprite, type Sprite } from "@/lib/sprites";

/* per-world wrapper colors + empty-state copy */
const WORLD_BG: Record<string, string> = {
  ocean: "#0a4d8f",
  space: "#151040",
  farm: "#6ec3f7",
  dino: "#2d1b4e",
};
const WORLD_EMPTY: Record<string, { emoji: string; line: string }> = {
  ocean: { emoji: "🐠", line: "Your reef is waiting…" },
  space: { emoji: "🚀", line: "Your galaxy is waiting…" },
  farm: { emoji: "🐮", line: "Your meadow is waiting…" },
  dino: { emoji: "🦕", line: "Your island is waiting…" },
};

/* ── runtime state per creature ──────────────────────────────────────────── */
interface RT {
  x: number; y: number; dir: 1 | -1;
  baseY: number; t: number; speed: number;
  excite: number; born: number; labelT: number;
  seed: number;
}

export default function WorldScene({
  creatures,
  newId,
  worldId,
  polishingIds,
  onBack,
  onDrawMore,
  onPlayGame,
}: {
  creatures: Creature[];
  newId: string | null;
  worldId: string;
  polishingIds?: Set<string>;
  onBack: () => void;
  onDrawMore: () => void;
  onPlayGame: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const spritesRef = useRef<Map<string, Sprite>>(new Map());
  const rtRef = useRef<Map<string, RT>>(new Map());
  const fxRef = useRef(newFxState());
  const burstRef = useRef<{ x: number; y: number }[]>([]); // evolution bursts (world coords)
  const seenArtRef = useRef<Set<string>>(new Set());
  const [banner, setBanner] = useState<string | null>(null);
  const [muted, setM] = useState(isMuted());
  const [artTick, forceTick] = useState(0);
  const creaturesRef = useRef(creatures);
  creaturesRef.current = creatures;
  const polishRef = useRef<Set<string>>(polishingIds ?? new Set());
  polishRef.current = polishingIds ?? new Set();

  // re-render when AI art finishes downloading
  useEffect(() => onArtLoaded(() => forceTick((n) => n + 1)), []);

  // evolution moment: a creature's premium art just arrived
  useEffect(() => {
    for (const c of creatures) {
      if (!c.artUrl || seenArtRef.current.has(c.id)) continue;
      seenArtRef.current.add(c.id);
      const rt = rtRef.current.get(c.id);
      if (!rt) continue; // creature not staged yet; burst next visit instead
      // only celebrate if the art image is actually ready to show
      if (!artSprite(c.artUrl)) { seenArtRef.current.delete(c.id); continue; }
      burstRef.current.push({ x: rt.x, y: rt.y });
      rt.excite = 1;
      rt.labelT = performance.now();
      sfxMagic();
      setBanner(`✨ The magic dust worked! ${c.name} transformed!`);
      const t = setTimeout(() => setBanner(null), 3200);
      return () => clearTimeout(t);
    }
  }, [creatures, artTick]);
  const newCreature = useMemo(() => creatures.find((c) => c.id === newId) ?? null, [creatures, newId]);
  const floorR = floorRatio(worldId);
  const copy = BEHAVIOR_COPY[worldId] ?? BEHAVIOR_COPY.ocean;

  // bake sprites for any new creatures (photo creatures bake async)
  useEffect(() => {
    const ensureRT = (c: Creature) => {
      if (rtRef.current.has(c.id)) return;
      const kind = kindById(c.kindId);
      const b = kind.behavior;
      const grounded = b === "drive" || b === "grow" || b === "crawl";
      const top = b === "twinkle";
      rtRef.current.set(c.id, {
        x: 0.2 + Math.random() * 0.6,
        y: grounded ? floorR + Math.random() * 0.04 : top ? 0.1 + Math.random() * 0.12 : 0.25 + Math.random() * 0.45,
        dir: Math.random() > 0.5 ? 1 : -1,
        baseY: 0.3 + Math.random() * 0.4,
        t: Math.random() * 100,
        speed: (0.02 + Math.random() * 0.025) * (b === "crawl" || b === "drive" ? 0.7 : 1),
        excite: 0,
        born: c.id === newId ? performance.now() : -1e9,
        labelT: c.id === newId ? performance.now() + 1200 : -1e9,
        seed: Math.random() * 1000,
      });
    };
    for (const c of creatures) {
      if (!spritesRef.current.has(c.id)) {
        if (c.photoData) {
          // paper-photo creature: stickerize the lifted drawing
          const im = new Image();
          im.onload = () => {
            const S = Math.min(1, 160 / Math.max(im.width, im.height));
            const tmp = document.createElement("canvas");
            tmp.width = Math.max(1, Math.round(im.width * S));
            tmp.height = Math.max(1, Math.round(im.height * S));
            tmp.getContext("2d")!.drawImage(im, 0, 0, tmp.width, tmp.height);
            const sticker = stickerizeImage(tmp);
            spritesRef.current.set(c.id, { frames: [sticker, sticker, sticker, sticker], w: sticker.width, h: sticker.height });
            ensureRT(c);
          };
          im.src = c.photoData;
          continue;
        }
        spritesRef.current.set(c.id, bakeCrayonSprite(c));
      }
      ensureRT(c);
    }
  }, [creatures, newId, floorR]);

  // entrance banner + splash sound
  useEffect(() => {
    if (!newCreature) return;
    const kind = kindById(newCreature.kindId);
    sfxSplash();
    const arrival = (copy[kind.behavior] ?? copy.swim).arrival;
    setBanner(`${newCreature.name} the ${kind.label} ${arrival}!`);
    const t = setTimeout(() => setBanner(null), 3200);
    return () => clearTimeout(t);
  }, [newCreature, copy]);

  // gentle ambient bubbles (ocean only)
  useEffect(() => {
    if (worldId !== "ocean") return;
    const iv = setInterval(() => { if (Math.random() < 0.5) sfxBubble(); }, 5000);
    return () => clearInterval(iv);
  }, [worldId]);

  // main render loop
  useEffect(() => {
    const cv = canvasRef.current!;
    const wrap = wrapRef.current!;
    let raf = 0;
    let W = 0, H = 0;
    const bubbles: { x: number; y: number; r: number; v: number; wob: number }[] = [];
    const sparkles: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
    let lastT = performance.now();

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = wrap.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const seabedY = () => H * floorR;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const dpr = window.devicePixelRatio || 1;
      const ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = now / 1000;

      /* ── world theme (background + floor + ambience) ── */
      const frame = { ctx, W, H, t, floorY: seabedY() };
      if (worldId === "space") drawSpace(frame, fxRef.current, dt);
      else if (worldId === "farm") drawFarm(frame, fxRef.current, dt);
      else if (worldId === "dino") drawDino(frame, fxRef.current, dt);
      else drawOcean(frame, fxRef.current, dt);

      /* ── bubbles (ocean) / stardust motes (space) ── */
      if (worldId === "space") {
        ctx.save();
        ctx.fillStyle = "rgba(255,240,200,0.35)";
        for (let i = 0; i < 18; i++) {
          const sx = (((i * 389) % 1000) / 1000) * W + Math.sin(t * 0.3 + i * 2) * 30;
          const sy = (((i * 233 + t * 5) % 1000) / 1000) * H;
          ctx.beginPath();
          ctx.arc(sx, sy, 0.8 + (i % 3) * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (worldId === "ocean" && Math.random() < 0.06 && bubbles.length < 26) {
        bubbles.push({ x: Math.random() * W, y: seabedY(), r: 2 + Math.random() * 5, v: 26 + Math.random() * 30, wob: Math.random() * 10 });
      }
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.y -= b.v * dt;
        b.x += Math.sin(t * 3 + b.wob) * 0.4;
        if (b.y < H * 0.05) { bubbles.splice(i, 1); continue; }
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      /* ── creatures ── */
      const list = creaturesRef.current;
      for (const c of list) {
        const sp = spritesRef.current.get(c.id);
        const rt = rtRef.current.get(c.id);
        if (!sp || !rt) continue;
        const kind = kindById(c.kindId);
        const b = kind.behavior;
        rt.t += dt;
        rt.excite = Math.max(0, rt.excite - dt);
        const speedBoost = 1 + rt.excite * 3;
        const sizeF = Math.min(W, H) / 520;

        // behavior motion
        if (b === "swim" || b === "fly") {
          rt.x += rt.dir * rt.speed * speedBoost * dt;
          rt.baseY += Math.sin(t * 0.3 + rt.seed) * 0.008 * dt * 60;
          rt.baseY = Math.min(0.72, Math.max(0.16, rt.baseY));
          rt.y = rt.baseY + Math.sin(rt.t * (b === "fly" ? 1.4 : 0.9) + rt.seed) * 0.045;
          if (rt.x > 1.08) { rt.x = 1.08; rt.dir = -1; }
          if (rt.x < -0.08) { rt.x = -0.08; rt.dir = 1; }
        } else if (b === "drive" || b === "crawl") {
          rt.x += rt.dir * rt.speed * speedBoost * dt;
          rt.y = floorR + Math.abs(Math.sin(rt.t * (b === "drive" ? 9 : 4))) * -0.008;
          if (rt.x > 1.05) { rt.dir = -1; }
          if (rt.x < -0.05) { rt.dir = 1; }
        } else if (b === "float") {
          rt.y = 0.4 + Math.sin(rt.t * 0.35 + rt.seed) * 0.22;
          rt.x += Math.sin(rt.t * 0.22 + rt.seed * 2) * 0.0004;
        } else if (b === "twinkle") {
          rt.y += Math.sin(rt.t * 0.8 + rt.seed) * 0.0006;
          rt.x += Math.cos(rt.t * 0.5 + rt.seed) * 0.0004;
        } else if (b === "bounce") {
          rt.x += rt.dir * rt.speed * 0.8 * speedBoost * dt;
          const hop = Math.abs(Math.sin(rt.t * 2.2 + rt.seed));
          rt.y = 0.68 - hop * 0.24;
          if (rt.x > 1.02) rt.dir = -1;
          if (rt.x < -0.02) rt.dir = 1;
        }
        // grow: anchored, sway only

        const px = rt.x * W;
        const py = rt.y * H;
        const scl = c.scale * sizeF * (1 + rt.excite * 0.25);
        const entrance = now - rt.born < 1600;
        const e = entrance ? Math.max(0, Math.min(1, (now - rt.born) / 1600)) : 1;
        const ease = 1 - Math.pow(1 - e, 3);

        // entrance sparkle trail
        if (entrance && Math.random() < 0.7) {
          sparkles.push({
            x: px + (Math.random() - 0.5) * 50,
            y: py + (Math.random() - 0.5) * 50,
            vx: (Math.random() - 0.5) * 40,
            vy: -30 - Math.random() * 40,
            life: 1,
          });
        }
        // rocket exhaust: space flyers leave a stardust trail
        if (worldId === "space" && b === "fly" && !entrance && Math.random() < 0.18) {
          sparkles.push({
            x: px - rt.dir * 40 * sizeF * c.scale,
            y: py + (Math.random() - 0.5) * 14,
            vx: -rt.dir * (30 + Math.random() * 30),
            vy: (Math.random() - 0.5) * 20,
            life: 0.7,
          });
        }

        ctx.save();
        ctx.translate(px, py);
        if (entrance) {
          ctx.scale(ease * scl, ease * scl);
          ctx.rotate((1 - ease) * Math.PI * 4 * rt.dir);
          ctx.globalAlpha = ease;
        } else {
          const tilt = b === "swim" ? Math.sin(rt.t * 1.8 + rt.seed) * 0.07 :
                       b === "grow" ? Math.sin(rt.t * 1.1 + rt.seed) * 0.06 :
                       b === "twinkle" ? Math.sin(rt.t * 0.9 + rt.seed) * 0.1 : 0;
          const spaceRoll =
            worldId === "space" && (b === "swim" || b === "float" || b === "fly")
              ? Math.sin(rt.t * 0.45 + rt.seed) * 0.2
              : 0;
          const flip = (b === "swim" || b === "fly" || b === "drive" || b === "crawl") ? rt.dir : 1;
          ctx.scale(scl * flip, scl);
          ctx.rotate(tilt * flip + spaceRoll);
          if (b === "twinkle") {
            const p = 1 + Math.sin(rt.t * 3 + rt.seed) * 0.08;
            ctx.scale(p, p);
          }
        }
        // AI-polished art (breathing squash) or crayon wiggle frames
        const art = c.artUrl ? artSprite(c.artUrl) : null;
        if (art) {
          const breathe = 1 + Math.sin(rt.t * 2.4 + rt.seed) * 0.045 + rt.excite * 0.1;
          const ar = art.width / art.height;
          const ah = sp.h * 1.15;
          const aw = ah * ar;
          ctx.scale(breathe, 1 / breathe);
          ctx.drawImage(art, -aw / 2, -ah / 2, aw, ah);
        } else {
          const frame = Math.floor(rt.t * (rt.excite > 0 ? 14 : 7)) % 4;
          const img = sp.frames[frame];
          ctx.drawImage(img, -sp.w / 2, -sp.h / 2);
        }
        ctx.restore();

        // golden halo during entrance
        if (entrance) {
          ctx.save();
          ctx.globalAlpha = (1 - e) * 0.7;
          const rg = ctx.createRadialGradient(px, py, 4, px, py, 90 * ease + 10);
          rg.addColorStop(0, "rgba(255,214,90,0.9)");
          rg.addColorStop(1, "rgba(255,214,90,0)");
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(px, py, 90 * ease + 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // name label
        if (now - rt.labelT < 2200 && now - rt.labelT > 0) {
          ctx.save();
          ctx.font = `800 ${Math.round(15 * sizeF) + 8}px 'Baloo 2', sans-serif`;
          const label = `${c.name} the ${kind.label}`;
          const tw = ctx.measureText(label).width + 28;
          const ly = py - sp.h * scl * 0.62 - 18;
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.strokeStyle = "#2d2926";
          ctx.lineWidth = 2.5;
          const rx = px - tw / 2;
          const ry = ly - 26;
          ctx.beginPath();
          ctx.roundRect(rx, ry, tw, 34, 17);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#563e79";
          ctx.textAlign = "center";
          ctx.fillText(label, px, ly);
          ctx.restore();
        }

        // magic-dust aura: AI polish in progress for this creature
        if (polishRef.current.has(c.id) && !c.artUrl) {
          const R = (Math.max(sp.w, sp.h) / 2) * scl + 14;
          ctx.save();
          ctx.translate(px, py);
          for (let k = 0; k < 7; k++) {
            const a = t * 1.6 + (k / 7) * Math.PI * 2 + rt.seed;
            const rr = R * (1 + 0.12 * Math.sin(t * 3 + k * 1.7));
            const sx = Math.cos(a) * rr;
            const sy = Math.sin(a) * rr * 0.8;
            const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 4.2 + k * 2.1));
            ctx.globalAlpha = tw;
            ctx.fillStyle = k % 3 === 0 ? "#fff3c4" : "#ffd65a";
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(t * 3 + k);
            const sr = 4.5 * sizeF + 2;
            ctx.beginPath();
            for (let p = 0; p < 4; p++) {
              ctx.rotate(Math.PI / 2);
              ctx.lineTo(0, -sr * 2);
              ctx.lineTo(sr * 0.42, -sr * 0.42);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          // tiny hint pill above the creature
          const hint = "✨ magic dust…";
          ctx.font = `800 ${Math.round(11 * sizeF) + 7}px 'Baloo 2', sans-serif`;
          const hw = ctx.measureText(hint).width + 20;
          const hy = -R - 26 + Math.sin(t * 2.2) * 3;
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = "#ffd65a";
          ctx.strokeStyle = "#2d2926";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(-hw / 2, hy - 16, hw, 24, 12);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#2d2926";
          ctx.textAlign = "center";
          ctx.fillText(hint, 0, hy);
          ctx.restore();
        }
      }

      /* ── sparkles (incl. evolution bursts) ── */
      while (burstRef.current.length) {
        const b = burstRef.current.pop()!;
        for (let k = 0; k < 46; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = 60 + Math.random() * 160;
          sparkles.push({
            x: b.x * W + (Math.random() - 0.5) * 30,
            y: b.y * H + (Math.random() - 0.5) * 30,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 40,
            life: 1 + Math.random() * 0.4,
          });
        }
      }
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i];
        s.life -= dt * 1.4;
        if (s.life <= 0) { sparkles.splice(i, 1); continue; }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        ctx.save();
        ctx.globalAlpha = s.life;
        ctx.fillStyle = "#ffd65a";
        ctx.translate(s.x, s.y);
        ctx.rotate(t * 4);
        const r = 4 * s.life + 1;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          ctx.rotate(Math.PI / 2);
          ctx.lineTo(0, -r * 2);
          ctx.lineTo(r * 0.4, -r * 0.4);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  // tap a creature → it jumps + shows its name
  const onTap = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    let hit: Creature | null = null;
    for (const c of creaturesRef.current) {
      const rt = rtRef.current.get(c.id);
      if (!rt) continue;
      if (Math.hypot(rt.x - x, (rt.y - y) * 0.9) < 0.09) { hit = c; break; }
    }
    if (hit) {
      const rt = rtRef.current.get(hit.id)!;
      rt.excite = 1;
      rt.labelT = performance.now();
      sfxPop();
    }
  };

  const doShare = async () => {
    sfxTap();
    const src = canvasRef.current!;
    const card = document.createElement("canvas");
    card.width = 1200; card.height = 900;
    const ctx = card.getContext("2d")!;
    ctx.fillStyle = "#fdf3e3";
    ctx.fillRect(0, 0, 1200, 900);
    // world snapshot framed
    const mx = 60, my = 90, mw = 1080, mh = 620;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(mx, my, mw, mh, 36);
    ctx.clip();
    ctx.drawImage(src, 0, 0, src.width, src.height, mx, my, mw, mh);
    ctx.restore();
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#2d2926";
    ctx.beginPath();
    ctx.roundRect(mx, my, mw, mh, 36);
    ctx.stroke();
    // title
    ctx.fillStyle = "#563e79";
    ctx.font = "800 54px 'Baloo 2', sans-serif";
    ctx.textAlign = "center";
    const star = newCreature ? `“${newCreature.name}” came alive!` : "Look what I drew — it’s ALIVE!";
    ctx.fillText(star, 600, 60);
    ctx.font = "700 34px 'Baloo 2', sans-serif";
    ctx.fillStyle = "#00a99f";
    ctx.fillText("✨ made with MAGIC PEN ✨", 600, 800);
    ctx.font = "700 24px Nunito, sans-serif";
    ctx.fillStyle = "#8a7a9e";
    ctx.fillText("draw it · it lives", 600, 845);

    const blob = await new Promise<Blob | null>((res) => card.toBlob(res, "image/png"));
    if (!blob) return;
    const file = new File([blob], "magic-pen.png", { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "MAGIC PEN", text: "My drawing came alive! 🪄" }); } catch { /* cancelled */ }
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "magic-pen.png";
      a.click();
    }
  };

  return (
    <div ref={wrapRef} className="h-full relative overflow-hidden" style={{ background: WORLD_BG[worldId] ?? "#0a4d8f" }}>
      <canvas ref={canvasRef} className="absolute inset-0 canvas-touch" onPointerDown={onTap} />

      {/* HUD */}
      <div className="absolute top-0 inset-x-0 p-4 flex items-center gap-2.5 pointer-events-none">
        <button onClick={() => { sfxTap(); onBack(); }} className="sticker-btn pointer-events-auto bg-white rounded-full w-11 h-11 grid place-items-center text-xl font-black" aria-label="Home">🏠</button>
        <div className="flex-1" />
        <button
          onClick={() => { const m = !muted; setM(m); setMuted(m); sfxTap(); }}
          className="sticker-btn pointer-events-auto bg-white rounded-full w-11 h-11 grid place-items-center text-xl"
          aria-label="Sound"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        {creatures.length > 0 && (
          <button
            onClick={() => { sfxHappy(); onPlayGame(); }}
            className="sticker-btn pointer-events-auto rounded-full px-3 sm:px-4 h-11 font-display font-extrabold text-white whitespace-nowrap"
            style={{ background: "linear-gradient(120deg,#00c2b9,#3aae3a 130%)" }}
          >
            🎮<span className="hidden sm:inline">&nbsp;Play</span>
          </button>
        )}
        <button onClick={doShare} className="sticker-btn pointer-events-auto bg-[var(--sun)] rounded-full px-3 sm:px-4 h-11 font-display font-bold text-[var(--ink)]">
          📸<span className="hidden sm:inline">&nbsp;Share</span>
        </button>
        <button
          onClick={() => { sfxHappy(); onDrawMore(); }}
          className="sticker-btn pointer-events-auto rounded-full px-3 sm:px-5 h-11 font-display font-extrabold text-white text-base sm:text-lg whitespace-nowrap"
          style={{ background: "linear-gradient(120deg,#8b46c7,#fb66e5)" }}
        >
          ✏️ Draw<span className="hidden sm:inline">&nbsp;more!</span>
        </button>
      </div>

      {/* entrance banner */}
      {banner && (
        <div className="absolute top-20 inset-x-0 flex justify-center pointer-events-none">
          <div className="anim-spring-pop sticker-card px-6 py-3 font-display font-extrabold text-xl text-[var(--plum)] text-center max-w-[90%]">
            🎉 {banner}
          </div>
        </div>
      )}

      {/* golden flash on arrival */}
      {newCreature && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(circle at 50% 55%, rgba(255,214,90,0.55), transparent 60%)",
            animation: "screen-fade 1.4s ease-out reverse both",
          }}
        />
      )}

      {/* creature count chip */}
      {creatures.length > 0 && (
        <div className="absolute bottom-4 left-4 pointer-events-none anim-rise-in">
          <div className="sticker-card px-4 py-2 font-display font-bold text-sm text-[var(--plum)] flex items-center gap-2">
            <span className="anim-wiggle inline-block">🐠</span>
            {creatures.length} {creatures.length === 1 ? "friend" : "friends"} alive
          </div>
        </div>
      )}

      {/* empty state */}
      {creatures.length === 0 && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className={`text-center font-display ${worldId === "farm" ? "text-[#2d2926]/75" : "text-white/85"}`}>
            <div className="text-5xl mb-3">{(WORLD_EMPTY[worldId] ?? WORLD_EMPTY.ocean).emoji}</div>
            <div className="text-2xl font-bold">{(WORLD_EMPTY[worldId] ?? WORLD_EMPTY.ocean).line}</div>
            <div className="text-lg opacity-80">draw something and set it free!</div>
          </div>
        </div>
      )}
    </div>
  );
}
