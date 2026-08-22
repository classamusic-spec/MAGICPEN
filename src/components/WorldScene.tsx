// ─── World scene: the living canvas where a kid's creatures actually live ───
// Owns the render loop, the HUD, the banner queue, the friends roster (look at
// a creature up close, rename it, release it) and the share card.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Creature } from "@/lib/types";
import { kindById, BEHAVIOR_COPY, WORLD_PACKS } from "@/lib/creatures";
import { sfxBubble, sfxPop, sfxSplash, sfxTap, setMuted, isMuted, sfxHappy, sfxMagic } from "@/lib/audio";
import { drawOcean, drawSpace, drawFarm, drawDino, newFxState, floorRatio } from "./world/themes";
import { sampleFrame, clearLayers } from "./world/shared";
import { artSprite, onArtLoaded, stickerizeImage } from "@/lib/polish";
import { bakeCrayonSprite, type Sprite } from "@/lib/sprites";
import { saveCreatures } from "@/lib/storage";

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

const MAX_NAME = 16;
const BANNER_MS = 2800;
const LONG_PRESS_MS = 520;

/* ── runtime state per creature ──────────────────────────────────────────── */
interface RT {
  x: number; y: number; dir: 1 | -1;
  baseY: number; t: number; speed: number;
  excite: number; born: number; labelT: number;
  seed: number;
}

/** Small offscreen-sprite thumbnail — no dependency on the Home screen. */
function CreatureThumb({
  creature, sprite, size, tick,
}: { creature: Creature; sprite: HTMLCanvasElement | null; size: number; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const src = (creature.artUrl ? artSprite(creature.artUrl) : null) ?? sprite;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    cv.style.width = `${size}px`;
    cv.style.height = `${size}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (!src || !src.width || !src.height) return;
    const k = Math.min(size / src.width, size / src.height);
    const w = src.width * k, h = src.height * k;
    ctx.drawImage(src, (size - w) / 2, (size - h) / 2, w, h);
  }, [creature.artUrl, creature.id, sprite, size, tick]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none" />;
}

export default function WorldScene({
  creatures,
  newId,
  worldId,
  polishingIds,
  onBack,
  onDrawMore,
  onPlayGame,
  onRenameCreature,
  onDeleteCreature,
}: {
  creatures: Creature[];
  newId: string | null;
  worldId: string;
  polishingIds?: Set<string>;
  onBack: () => void;
  onDrawMore: () => void;
  onPlayGame: () => void;
  /** Optional: let the app own creature edits. Falls back to local + storage. */
  onRenameCreature?: (id: string, name: string) => void;
  onDeleteCreature?: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const spritesRef = useRef<Map<string, Sprite>>(new Map());
  const rtRef = useRef<Map<string, RT>>(new Map());
  const fxRef = useRef(newFxState());
  const burstRef = useRef<{ x: number; y: number }[]>([]); // evolution bursts (world coords)
  const seenArtRef = useRef<Set<string>>(new Set());
  const arrivalRef = useRef<string | null>(null);
  const [muted, setM] = useState(isMuted());
  const [artTick, forceTick] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<{ mode: "roster" } | { mode: "detail"; id: string } | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [tip, setTip] = useState(true);

  /* local creature edits — used when the app doesn't hand us callbacks */
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [released, setReleased] = useState<Set<string>>(() => new Set());
  const view = useMemo(
    () =>
      creatures
        .filter((c) => !released.has(c.id))
        .map((c) => (renames[c.id] && renames[c.id] !== c.name ? { ...c, name: renames[c.id] } : c)),
    [creatures, renames, released],
  );

  const creaturesRef = useRef(view);
  creaturesRef.current = view;
  const polishRef = useRef<Set<string>>(polishingIds ?? new Set());
  polishRef.current = polishingIds ?? new Set();
  const worldRef = useRef(worldId);
  worldRef.current = worldId;
  const floorR = floorRatio(worldId);
  const floorRef = useRef(floorR);
  floorRef.current = floorR;

  const copy = BEHAVIOR_COPY[worldId] ?? BEHAVIOR_COPY.ocean;
  const newCreature = useMemo(() => view.find((c) => c.id === newId) ?? null, [view, newId]);
  const detail = sheet?.mode === "detail" ? view.find((c) => c.id === sheet.id) ?? null : null;

  /* ── banner queue: arrivals and evolutions never clobber each other ────── */
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const bannerQ = useRef<{ id: number; text: string }[]>([]);
  const bannerBusy = useRef(false);
  const bannerId = useRef(0);
  const pushBanner = useCallback((text: string) => {
    const item = { id: ++bannerId.current, text };
    if (bannerBusy.current) {
      bannerQ.current.push(item);
      if (bannerQ.current.length > 4) bannerQ.current.splice(0, bannerQ.current.length - 4);
      return;
    }
    bannerBusy.current = true;
    setBanner(item);
  }, []);
  useEffect(() => {
    if (!banner) { bannerBusy.current = false; return; }
    const t = window.setTimeout(() => {
      const next = bannerQ.current.shift() ?? null;
      bannerBusy.current = !!next;
      setBanner(next);
    }, BANNER_MS);
    return () => window.clearTimeout(t);
  }, [banner]);

  // the touch tip says its piece once, then leaves
  useEffect(() => {
    if (!tip) return;
    const t = window.setTimeout(() => setTip(false), 6000);
    return () => window.clearTimeout(t);
  }, [tip]);

  // re-render when AI art finishes downloading
  useEffect(() => onArtLoaded(() => forceTick((n) => n + 1)), []);

  // evolution moment: a creature's premium art just arrived
  useEffect(() => {
    for (const c of view) {
      if (!c.artUrl || seenArtRef.current.has(c.id)) continue;
      const rt = rtRef.current.get(c.id);
      if (!rt) continue; // creature not staged yet; burst next visit instead
      // only celebrate if the art image is actually ready to show
      if (!artSprite(c.artUrl)) continue;
      seenArtRef.current.add(c.id);
      burstRef.current.push({ x: rt.x, y: rt.y });
      rt.excite = 1;
      rt.labelT = performance.now();
      sfxMagic();
      pushBanner(`✨ The magic dust worked! ${c.name} transformed!`);
    }
  }, [view, artTick, pushBanner]);

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
    for (const c of view) {
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
            forceTick((n) => n + 1); // roster thumbnails can paint now
          };
          im.src = c.photoData;
          continue;
        }
        spritesRef.current.set(c.id, bakeCrayonSprite(c));
      }
      ensureRT(c);
    }
    // released creatures must not keep their sprite/runtime state alive
    const alive = new Set(view.map((c) => c.id));
    for (const id of [...rtRef.current.keys()]) if (!alive.has(id)) rtRef.current.delete(id);
    for (const id of [...spritesRef.current.keys()]) if (!alive.has(id)) spritesRef.current.delete(id);
  }, [view, newId, floorR]);

  // entrance banner + splash sound (once per arriving creature)
  useEffect(() => {
    if (!newCreature || arrivalRef.current === newCreature.id) return;
    arrivalRef.current = newCreature.id;
    const kind = kindById(newCreature.kindId);
    sfxSplash();
    const arrival = (copy[kind.behavior] ?? copy.swim).arrival;
    pushBanner(`${newCreature.name} the ${kind.label} ${arrival}!`);
  }, [newCreature, copy, pushBanner]);

  // gentle ambient bubbles (ocean only)
  useEffect(() => {
    if (worldId !== "ocean") return;
    const iv = setInterval(() => { if (Math.random() < 0.5) sfxBubble(); }, 5000);
    return () => clearInterval(iv);
  }, [worldId]);

  // a world switch invalidates every cached scenery layer
  useEffect(() => {
    fxRef.current = newFxState();
    return () => clearLayers();
  }, [worldId]);

  /* ── main render loop ─────────────────────────────────────────────────── */
  // Intentionally mount-scoped: everything that changes over the scene's life
  // (creature list, world id, floor ratio, polish set) is read through a ref,
  // so the loop is never torn down and rebuilt mid-animation.
  useEffect(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;
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

    const seabedY = () => H * floorRef.current;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      sampleFrame(dt);
      const dpr = window.devicePixelRatio || 1;
      const ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = now / 1000;
      const world = worldRef.current;
      const floorNorm = floorRef.current;

      /* ── world theme (background + floor + ambience) ── */
      const frame = { ctx, W, H, t, floorY: seabedY() };
      if (world === "space") drawSpace(frame, fxRef.current, dt);
      else if (world === "farm") drawFarm(frame, fxRef.current, dt);
      else if (world === "dino") drawDino(frame, fxRef.current, dt);
      else drawOcean(frame, fxRef.current, dt);

      /* ── bubbles (ocean) / stardust motes (space) ── */
      if (world === "space") {
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
      if (world === "ocean" && Math.random() < 0.06 && bubbles.length < 26) {
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
          rt.y = floorNorm + Math.abs(Math.sin(rt.t * (b === "drive" ? 9 : 4))) * -0.008;
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
        if (world === "space" && b === "fly" && !entrance && Math.random() < 0.18) {
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
            world === "space" && (b === "swim" || b === "float" || b === "fly")
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
          const frameI = Math.floor(rt.t * (rt.excite > 0 ? 14 : 7)) % 4;
          const img = sp.frames[frameI];
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

  /* ── tapping a creature ───────────────────────────────────────────────── */
  const pressRef = useRef<{ id: string; x: number; y: number; timer: number } | null>(null);

  const cancelPress = useCallback(() => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  }, []);
  useEffect(() => cancelPress, [cancelPress]);

  /** Size-aware hit test: the target grows with the creature, never below 48px. */
  const hitAt = useCallback((nx: number, ny: number, W: number, H: number): Creature | null => {
    const sizeF = Math.min(W, H) / 520;
    const maxR = Math.min(W, H) * 0.3;
    let best: { c: Creature; d: number } | null = null;
    for (const c of creaturesRef.current) {
      const rt = rtRef.current.get(c.id);
      const sp = spritesRef.current.get(c.id);
      if (!rt || !sp) continue;
      const scl = c.scale * sizeF * (1 + rt.excite * 0.25);
      const rPx = Math.min(maxR, Math.max(28, (Math.max(sp.w, sp.h) / 2) * scl * 1.05));
      const d = Math.hypot((rt.x - nx) * W, (rt.y - ny) * H) / rPx;
      if (d <= 1 && (!best || d < best.d)) best = { c, d };
    }
    return best?.c ?? null;
  }, []);

  const onCanvasDown = (e: React.PointerEvent) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    const hit = hitAt(nx, ny, r.width, r.height);
    if (!hit) return;
    const rt = rtRef.current.get(hit.id);
    if (rt) { rt.excite = 1; rt.labelT = performance.now(); }
    sfxPop();
    cancelPress();
    // hold a creature to open its card
    const id = hit.id;
    pressRef.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      timer: window.setTimeout(() => {
        pressRef.current = null;
        if ("vibrate" in navigator) navigator.vibrate(18);
        setNameDraft(creaturesRef.current.find((x) => x.id === id)?.name ?? "");
        setConfirmDel(false);
        setSheet({ mode: "detail", id });
      }, LONG_PRESS_MS),
    };
  };
  const onCanvasMove = (e: React.PointerEvent) => {
    const p = pressRef.current;
    if (!p) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 14) cancelPress();
  };

  /* ── creature edits ───────────────────────────────────────────────────── */
  // When the app hands us callbacks it owns the data. Otherwise we keep the
  // edit locally and write it back ourselves — see the persistence effect.
  const appOwnsEdits = !!onRenameCreature || !!onDeleteCreature;
  const editedRef = useRef(false);

  const commitRename = useCallback((c: Creature, raw: string) => {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
    if (!name || name === c.name) return;
    if (onRenameCreature) onRenameCreature(c.id, name);
    else {
      editedRef.current = true;
      setRenames((r) => ({ ...r, [c.id]: name }));
    }
    sfxHappy();
    pushBanner(`✏️ Say hello to ${name}!`);
  }, [onRenameCreature, pushBanner]);

  const releaseCreature = useCallback((c: Creature) => {
    if (onDeleteCreature) onDeleteCreature(c.id);
    else {
      editedRef.current = true;
      setReleased((s) => new Set(s).add(c.id));
    }
    sfxSplash();
    pushBanner(`👋 ${c.name} went off to explore. Bye!`);
    setConfirmDel(false);
    setSheet(view.length > 1 ? { mode: "roster" } : null);
  }, [onDeleteCreature, pushBanner, view.length]);

  /* Fallback persistence. The timeout deliberately lands after the parent's own
     save effect (child effects run first), so a background art update can't
     resurrect a released creature or an old name. Wiring
     onRenameCreature/onDeleteCreature in App.tsx removes the need for this. */
  useEffect(() => {
    if (appOwnsEdits || !editedRef.current) return;
    const t = window.setTimeout(() => {
      try { saveCreatures(view); } catch { /* storage full / private mode */ }
    }, 0);
    return () => window.clearTimeout(t);
  }, [view, appOwnsEdits]);

  /* ── share card ───────────────────────────────────────────────────────── */
  const doShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    sfxTap();
    try {
      const src = canvasRef.current;
      if (!src || !src.width || !src.height) return;
      const card = document.createElement("canvas");
      card.width = 1200; card.height = 900;
      const ctx = card.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fdf3e3";
      ctx.fillRect(0, 0, 1200, 900);
      // world snapshot framed, cropped to fill (never squashed)
      const mx = 60, my = 90, mw = 1080, mh = 620;
      const srcAR = src.width / src.height;
      const dstAR = mw / mh;
      let sw = src.width, sh = src.height, sx = 0, sy = 0;
      if (srcAR > dstAR) { sw = src.height * dstAR; sx = (src.width - sw) / 2; }
      else { sh = src.width / dstAR; sy = (src.height - sh) / 2; }
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(mx, my, mw, mh, 36);
      ctx.clip();
      ctx.drawImage(src, sx, sy, sw, sh, mx, my, mw, mh);
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
      if (!blob) { pushBanner("Hmm — the photo didn't come out. Try again!"); return; }
      const file = new File([blob], "magic-pen.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "MAGIC PEN", text: "My drawing came alive! 🪄" });
          return;
        } catch (err) {
          // kid cancelled → done; anything else (desktop, permissions) → download
          if ((err as DOMException)?.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "magic-pen.png";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      pushBanner("📸 Saved your world as a picture!");
    } finally {
      setSharing(false);
    }
  }, [newCreature, pushBanner, sharing]);

  /* ── overlays: close on Escape ────────────────────────────────────────── */
  useEffect(() => {
    if (!sheet && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sheet) setSheet(null);
      else setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, menuOpen]);

  const openDetail = (c: Creature) => {
    sfxTap();
    setNameDraft(c.name);
    setConfirmDel(false);
    setSheet({ mode: "detail", id: c.id });
  };
  const empty = WORLD_EMPTY[worldId] ?? WORLD_EMPTY.ocean;
  const prompts = (WORLD_PACKS.find((p) => p.id === worldId) ?? WORLD_PACKS[0]).prompts;
  const padX = { paddingLeft: "max(12px, env(safe-area-inset-left))", paddingRight: "max(12px, env(safe-area-inset-right))" };

  return (
    <div ref={wrapRef} className="h-full relative overflow-hidden" style={{ background: WORLD_BG[worldId] ?? "#0a4d8f" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 canvas-touch"
        onPointerDown={onCanvasDown}
        onPointerMove={onCanvasMove}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
      />

      {/* ── HUD ── */}
      <div
        className="absolute top-0 inset-x-0 z-20 pointer-events-none"
        style={{ ...padX, paddingTop: "max(10px, env(safe-area-inset-top))" }}
      >
        <div className="flex items-start gap-2">
          <button
            onClick={() => { sfxTap(); onBack(); }}
            className="sticker-btn hud-focus hud-tap pointer-events-auto bg-white rounded-full w-12 h-12 grid place-items-center text-xl"
            aria-label="Back to home"
          >
            🏠
          </button>
          <div className="flex-1" />
          {view.length > 0 && (
            <button
              onClick={() => { sfxHappy(); onPlayGame(); }}
              className="sticker-btn hud-focus hud-tap pointer-events-auto rounded-full px-3 h-12 grid place-items-center font-display font-extrabold text-white whitespace-nowrap"
              style={{ background: "linear-gradient(120deg,#00c2b9,#3aae3a 130%)" }}
              aria-label="Play mini-games"
            >
              🎮<span className="hidden sm:inline">&nbsp;Play</span>
            </button>
          )}
          <button
            onClick={() => { sfxHappy(); onDrawMore(); }}
            className="sticker-btn hud-focus hud-tap pointer-events-auto rounded-full px-3 h-12 grid place-items-center font-display font-extrabold text-white whitespace-nowrap"
            style={{ background: "linear-gradient(120deg,#8b46c7,#fb66e5)" }}
            aria-label="Draw another creature"
          >
            ✏️ Draw<span className="hidden sm:inline">&nbsp;more!</span>
          </button>
          <button
            onClick={() => { sfxTap(); setMenuOpen((o) => !o); }}
            className="sticker-btn hud-focus hud-tap pointer-events-auto bg-white rounded-full w-12 h-12 grid place-items-center text-xl font-black text-[var(--plum)]"
            aria-label="More world options"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            ⋯
          </button>
        </div>

        {menuOpen && (
          <>
            <button
              className="fixed inset-0 z-10 pointer-events-auto cursor-default"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
            <div className="relative z-20 mt-2 flex justify-end pointer-events-auto">
              <div className="hud-sheet sticker-card p-2 w-56 max-w-full grid gap-1.5" role="menu" aria-label="World options">
                <button
                  role="menuitem"
                  onClick={() => { const m = !muted; setM(m); setMuted(m); sfxTap(); }}
                  className="hud-focus h-12 rounded-2xl px-3 flex items-center gap-2 font-display font-bold text-[var(--plum)] hover:bg-[var(--paper-deep)] text-left"
                >
                  <span className="text-xl w-6 text-center" aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
                  {muted ? "Sound is off" : "Sound is on"}
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); void doShare(); }}
                  disabled={sharing}
                  className="hud-focus h-12 rounded-2xl px-3 flex items-center gap-2 font-display font-bold text-[var(--plum)] hover:bg-[var(--paper-deep)] text-left disabled:opacity-50"
                >
                  <span className="text-xl w-6 text-center" aria-hidden="true">📸</span>
                  {sharing ? "Making photo…" : "Share a photo"}
                </button>
                <button
                  role="menuitem"
                  onClick={() => { sfxTap(); setMenuOpen(false); setSheet({ mode: "roster" }); }}
                  className="hud-focus h-12 rounded-2xl px-3 flex items-center gap-2 font-display font-bold text-[var(--plum)] hover:bg-[var(--paper-deep)] text-left"
                >
                  <span className="text-xl w-6 text-center" aria-hidden="true">📖</span>
                  My friends ({view.length})
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── banner queue ── */}
      {banner && (
        <div className="absolute top-24 inset-x-0 z-10 flex justify-center pointer-events-none" style={padX}>
          <div
            key={banner.id}
            className="anim-spring-pop sticker-card px-5 py-2.5 font-display font-extrabold text-lg sm:text-xl text-[var(--plum)] text-center max-w-[92%]"
            role="status"
          >
            🎉 {banner.text}
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

      {/* ── friends chip → roster ── */}
      {view.length > 0 && (
        <button
          onClick={() => { sfxTap(); setSheet({ mode: "roster" }); }}
          className="sticker-btn hud-focus absolute z-20 bg-white rounded-full h-12 px-4 flex items-center gap-2 font-display font-bold text-sm text-[var(--plum)] anim-rise-in"
          style={{ left: "max(12px, env(safe-area-inset-left))", bottom: "max(12px, env(safe-area-inset-bottom))" }}
          aria-label={`Open your friends list — ${view.length} creatures`}
        >
          <span className="anim-wiggle hud-motion inline-block" aria-hidden="true">🐠</span>
          {view.length} {view.length === 1 ? "friend" : "friends"}
        </button>
      )}

      {/* ── empty state: an actual invitation ── */}
      {view.length === 0 && (
        <div className="absolute inset-0 z-10 grid place-items-center p-4 pointer-events-none" style={padX}>
          <div className="hud-fade-in sticker-card pointer-events-auto max-w-xs w-full p-5 text-center">
            <div className="text-5xl mb-1 anim-float-y hud-motion" aria-hidden="true">{empty.emoji}</div>
            <h2 className="font-display font-extrabold text-2xl text-[var(--plum)] leading-tight">{empty.line}</h2>
            <p className="font-bold text-sm text-[var(--muted-foreground)] mt-1">
              Draw one thing and watch it come alive right here.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 my-3">
              {prompts.slice(0, 3).map((p) => (
                <span key={p} className="text-xs font-extrabold text-[var(--plum)] bg-[var(--paper-deep)] border-2 border-[var(--ink)] rounded-full px-2.5 py-1">
                  {p}
                </span>
              ))}
            </div>
            {/* the pulse lives on the wrapper so the button keeps its press feel */}
            <div className="hud-invite hud-motion">
              <button
                onClick={() => { sfxHappy(); onDrawMore(); }}
                className="sticker-btn btn-sheen hud-motion hud-focus w-full h-14 rounded-full font-display font-extrabold text-xl text-white"
                style={{ background: "linear-gradient(120deg,#8b46c7,#fb66e5)" }}
              >
                ✏️ Draw my first friend!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── roster / detail sheet ── */}
      {sheet && (
        <div
          className="hud-scrim absolute inset-0 z-30 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={sheet.mode === "roster" ? "Your friends" : "Creature card"}
          onPointerDown={(e) => { if (e.target === e.currentTarget) setSheet(null); }}
        >
          <div
            className="hud-sheet sticker-card w-full max-w-md flex flex-col overflow-hidden"
            style={{
              maxHeight: "86%",
              margin: "10px",
              marginBottom: "max(10px, env(safe-area-inset-bottom))",
            }}
          >
            <div className="shrink-0 flex items-center gap-2 p-3 border-b-[3px] border-[var(--ink)]">
              {sheet.mode === "detail" && (
                <button
                  onClick={() => { sfxTap(); setSheet({ mode: "roster" }); }}
                  className="sticker-btn hud-focus hud-tap bg-white rounded-full w-11 h-11 grid place-items-center text-lg text-[var(--plum)]"
                  aria-label="Back to your friends list"
                >
                  ←
                </button>
              )}
              <h2 className="font-display font-extrabold text-xl text-[var(--plum)] flex-1 min-w-0 truncate">
                {sheet.mode === "roster" ? `📖 My friends (${view.length})` : detail ? `${kindById(detail.kindId).emoji} ${detail.name}` : "…"}
              </h2>
              <button
                onClick={() => { sfxTap(); setSheet(null); }}
                className="sticker-btn hud-focus hud-tap bg-white rounded-full w-11 h-11 grid place-items-center text-lg font-black text-[var(--plum)]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {sheet.mode === "roster" && (
              <div
                className="overflow-y-auto hud-scroll p-3 grid gap-3 content-start"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))" }}
              >
                {view.map((c) => {
                  const k = kindById(c.kindId);
                  return (
                    <button
                      key={c.id}
                      onClick={() => openDetail(c)}
                      className="hud-focus rounded-2xl border-[3px] border-[var(--ink)] bg-[var(--paper)] p-1.5 grid place-items-center gap-0.5 relative"
                      aria-label={`Open ${c.name} the ${k.label}`}
                    >
                      <div className="h-16 grid place-items-center">
                        <CreatureThumb creature={c} sprite={spritesRef.current.get(c.id)?.frames[0] ?? null} size={62} tick={artTick} />
                      </div>
                      <div className="text-[11px] font-extrabold text-[var(--ink)] truncate w-full text-center">{c.name}</div>
                      <div className="text-[10px] font-bold text-[var(--muted-foreground)] truncate w-full text-center">{k.label}</div>
                      {polishRef.current.has(c.id) && !c.artUrl && (
                        <span className="absolute -top-2 -right-1 text-sm" aria-label="getting magic dust">✨</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {sheet.mode === "detail" && detail && (
              <div className="overflow-y-auto hud-scroll p-4">
                <div className="grid place-items-center mb-2">
                  <div className="rounded-3xl border-[3px] border-[var(--ink)] bg-[var(--paper)] p-2">
                    <CreatureThumb creature={detail} sprite={spritesRef.current.get(detail.id)?.frames[0] ?? null} size={132} tick={artTick} />
                  </div>
                </div>
                <p className="text-center font-bold text-sm text-[var(--muted-foreground)]">
                  {kindById(detail.kindId).label} · joined {new Date(detail.createdAt).toLocaleDateString()}
                </p>

                <label className="block mt-3 font-display font-extrabold text-sm text-[var(--plum)]" htmlFor="creature-name">
                  Name
                </label>
                <div className="flex gap-2 mt-1">
                  <input
                    id="creature-name"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value.slice(0, MAX_NAME))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename(detail, nameDraft); } }}
                    maxLength={MAX_NAME}
                    autoComplete="off"
                    className="hud-focus flex-1 min-w-0 h-12 rounded-2xl border-[3px] border-[var(--ink)] bg-white px-3 font-display font-extrabold text-lg text-[var(--ink)]"
                    aria-label="Creature name"
                  />
                  <button
                    onClick={() => commitRename(detail, nameDraft)}
                    disabled={!nameDraft.trim() || nameDraft.trim() === detail.name}
                    className="sticker-btn hud-focus rounded-2xl h-12 px-4 font-display font-extrabold text-white disabled:opacity-40"
                    style={{ background: "linear-gradient(120deg,#00c2b9,#3aae3a 130%)" }}
                  >
                    Save
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    onClick={() => {
                      const rt = rtRef.current.get(detail.id);
                      if (rt) { rt.excite = 1; rt.labelT = performance.now() + 260; }
                      sfxPop();
                      setSheet(null);
                    }}
                    className="sticker-btn hud-focus h-12 rounded-full bg-white font-display font-bold text-[var(--plum)]"
                  >
                    👋 Say hi
                  </button>
                  <button
                    onClick={() => { sfxHappy(); onPlayGame(); }}
                    className="sticker-btn hud-focus h-12 rounded-full font-display font-bold text-white"
                    style={{ background: "linear-gradient(120deg,#00c2b9,#3aae3a 130%)" }}
                  >
                    🎮 Play
                  </button>
                </div>

                {!confirmDel ? (
                  <button
                    onClick={() => { sfxTap(); setConfirmDel(true); }}
                    className="hud-focus mt-4 w-full h-12 rounded-full font-display font-bold text-[var(--coral)] underline underline-offset-4"
                  >
                    👋 Let {detail.name} go…
                  </button>
                ) : (
                  <div className="mt-4 rounded-2xl border-[3px] border-[var(--coral)] p-3 text-center">
                    <p className="font-display font-extrabold text-[var(--plum)]">
                      Really let {detail.name} go?
                    </p>
                    <p className="text-xs font-bold text-[var(--muted-foreground)] mb-2">
                      This drawing can't come back.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { sfxTap(); setConfirmDel(false); }}
                        className="sticker-btn hud-focus h-12 rounded-full bg-white font-display font-extrabold text-[var(--plum)]"
                      >
                        💚 Keep!
                      </button>
                      <button
                        onClick={() => releaseCreature(detail)}
                        className="sticker-btn hud-focus h-12 rounded-full font-display font-extrabold text-white"
                        style={{ background: "var(--coral)" }}
                      >
                        👋 Let go
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* how-to-touch tip, then it gets out of the way */}
      {tip && view.length > 0 && !sheet && (
        <div
          className="hud-hint absolute z-10 pointer-events-none flex justify-center inset-x-0 px-4"
          style={{ bottom: "max(76px, calc(env(safe-area-inset-bottom) + 76px))" }}
        >
          {/* a backing plate — the worlds behind this are busy, and the reef bed
              in particular swallowed the bare text entirely */}
          <span className="rounded-full bg-black/45 text-white text-xs font-bold px-3 py-1.5 backdrop-blur-[2px]">
            tap a friend to say hi · hold to open its card
          </span>
        </div>
      )}
    </div>
  );
}
