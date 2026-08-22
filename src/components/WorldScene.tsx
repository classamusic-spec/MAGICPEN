// ─── World scene: the living canvas where a kid's creatures actually live ───
// Owns the render loop, the HUD, the banner queue, the friends roster (look at
// a creature up close, rename it, release it) and the share card.
//
// The overlay is drawn, not chromed: every control is a wax fill inside a
// hand-inked edge, so the interface belongs to the same sketchbook as the
// artwork underneath it.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Creature } from "@/lib/types";
import { kindById, BEHAVIOR_COPY, WORLD_PACKS } from "@/lib/creatures";
import { sfxBubble, sfxPop, sfxSplash, sfxTap, setMuted, isMuted, sfxHappy, sfxMagic } from "@/lib/audio";
import { drawOcean, drawSpace, drawFarm, drawDino, newFxState, floorRatio } from "./world/themes";
import { sampleFrame, clearLayers } from "./world/shared";
import { artSprite, onArtLoaded, stickerizeImage } from "@/lib/polish";
import { bakeCrayonSprite, type Sprite } from "@/lib/sprites";
import { saveCreatures } from "@/lib/storage";
import { InkButton, InkCard, InkShape, Scribble, Tape } from "@/components/ink/Ink";
import { Icon, type IconName } from "@/components/ink/Icons";
import { hand, paperTile, roughRect, seedOf, tornEdge } from "@/lib/ink";
import { drawCrayonStroke } from "@/lib/crayon";

/* per-world wrapper colors + empty-state copy */
const WORLD_BG: Record<string, string> = {
  ocean: "#0a4d8f",
  space: "#151040",
  farm: "#6ec3f7",
  dino: "#2d1b4e",
};
const WORLD_EMPTY: Record<string, string> = {
  ocean: "Your reef is waiting…",
  space: "Your galaxy is waiting…",
  farm: "Your meadow is waiting…",
  dino: "Your island is waiting…",
};

/* ── the HUD's wax box ───────────────────────────────────────────────────────
   Four skies have to be survived: farm blue, reef blue, near-black space and a
   dusk jungle. So nothing here is white (white dissolves into the farm's
   clouds) and nothing is near-black (that sinks into space). Every control is a
   mid-tone wax inside an inked edge, and `.hud-drawn` lays a cream rim outside
   that edge so the silhouette still reads on the darkest ground. */
interface Tone { wax: string; on: string }
const TONE: Record<string, Tone> = {
  manila: { wax: "#e9c98d", on: "#2d2926" },
  sun: { wax: "#ffc72c", on: "#2d2926" },
  play: { wax: "#12a08f", on: "#fff6e6" },
  draw: { wax: "#8b46c7", on: "#fff6e6" },
  go: { wax: "#e0533f", on: "#fff6e6" },
};

const MAX_NAME = 16;
const BANNER_MS = 2800;
const LONG_PRESS_MS = 520;

/* the ink each banner icon is drawn in */
const BANNER_INK: Partial<Record<IconName, { color: string; fill?: string }>> = {
  sparkle: { color: "#2d2926", fill: "#ffc72c" },
  pencil: { color: "#8b46c7" },
  globe: { color: "#12a08f" },
  camera: { color: "#563e79" },
  heart: { color: "#2d2926", fill: "#ff6b6b" },
};

/* ── runtime state per creature ──────────────────────────────────────────── */
interface RT {
  x: number; y: number; dir: 1 | -1;
  baseY: number; t: number; speed: number;
  excite: number; born: number; labelT: number;
  seed: number;
}

/* ── drawn shapes on the world canvas ────────────────────────────────────── */

/** Baked once per size + hand, so the render loop never pays for the wobble. */
const tagCache = new Map<string, Path2D>();
function tagPath(w: number, h: number, seed: number): Path2D {
  const key = `${w}x${h}:${seed}`;
  let p = tagCache.get(key);
  if (!p) {
    if (tagCache.size > 96) tagCache.clear();
    p = new Path2D(roughRect(w, h, { seed, wobble: 2.1, radius: h * 0.3 }));
    tagCache.set(key, p);
  }
  return p;
}

/** The four-point sparkle the whole app uses instead of a ✨. */
function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    ctx.rotate(Math.PI / 2);
    ctx.lineTo(0, -r * 2);
    ctx.lineTo(r * 0.42, -r * 0.42);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ── measuring, so a drawn path can match its real pixel box ─────────────── */

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      // round to 2px so a press micro-resize doesn't redraw the hand
      const w = Math.round(r.width / 2) * 2;
      const h = Math.round(r.height / 2) * 2;
      setBox((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/* ── HUD control: a drawn object sitting in the world, not OS chrome ─────── */

interface HudBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Always-visible label. Omit for an icon-only 48×48 control. */
  label?: string;
  /** Tail of the label that only appears once the row has room for it. */
  labelWide?: string;
  tone?: Tone;
  iconFill?: string;
  seed?: number;
  round?: boolean;
}

function HudBtn({
  icon, label, labelWide, tone = TONE.manila, iconFill,
  seed, round = false, className = "", style, ...rest
}: HudBtnProps) {
  const [ref, box] = useBox<HTMLButtonElement>();
  const s = seed ?? seedOf(icon + (label ?? ""));
  const onWax = tone.on !== "#2d2926";
  return (
    <button
      ref={ref}
      className={`ink-btn hud-btn hud-drawn hud-focus-light pointer-events-auto relative isolate ${className}`}
      style={{
        padding: label ? "0 15px 0 13px" : 0,
        width: round ? 48 : undefined,
        minWidth: 48,
        height: 48,
        ...style,
      }}
      {...rest}
    >
      <InkShape
        w={box.w}
        h={box.h}
        shape={round ? "ellipse" : "rect"}
        seed={s}
        weight={3.1}
        radius={round ? undefined : 15}
        lifted={false}
        fill={{ kind: "wax", color: tone.wax }}
      />
      <span className="relative z-10 flex items-center justify-center gap-1.5">
        <Icon name={icon} size={round ? 25 : 22} color={tone.on} fill={iconFill} weight={2.3} />
        {label && (
          <span
            className={`font-display font-extrabold whitespace-nowrap ${onWax ? "ink-on-wax" : ""}`}
            style={{ color: tone.on, fontSize: "var(--fs-sm)" }}
          >
            {label}
            {labelWide && <span className="hidden sm:inline">{labelWide}</span>}
          </span>
        )}
      </span>
    </button>
  );
}

/** Paper fibre laid over a drawn sheet — the flat fill alone reads as plastic. */
function PaperFibre({ inset = 7, radius = 26 }: { inset?: number; radius?: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{ inset, borderRadius: radius, backgroundImage: "var(--paper-fibre, none)", opacity: 0.6 }}
    />
  );
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

/** Load a data-URL texture for the share card. Never rejects. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
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
  const [banner, setBanner] = useState<{ id: number; text: string; icon: IconName } | null>(null);
  const bannerQ = useRef<{ id: number; text: string; icon: IconName }[]>([]);
  const bannerBusy = useRef(false);
  const bannerId = useRef(0);
  const pushBanner = useCallback((text: string, icon: IconName = "sparkle") => {
    const item = { id: ++bannerId.current, text, icon };
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
      pushBanner(`The magic dust worked! ${c.name} transformed!`, "sparkle");
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
    pushBanner(`${newCreature.name} the ${kind.label} ${arrival}!`, "sparkle");
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

        // name label — a paper tag torn off and written on, not a UI pill
        if (now - rt.labelT < 2200 && now - rt.labelT > 0) {
          ctx.save();
          ctx.font = `800 ${Math.round(15 * sizeF) + 8}px 'Baloo 2', sans-serif`;
          const label = `${c.name} the ${kind.label}`;
          const tw = Math.round(ctx.measureText(label).width + 32);
          const th = 38;
          const ly = py - sp.h * scl * 0.62 - 18;
          const seed = (c.id.charCodeAt(0) * 37 + c.id.length * 11) % 997;
          const tag = tagPath(tw, th, seed);
          ctx.translate(px - tw / 2, ly - 28);
          ctx.fillStyle = "#fffaf0";
          ctx.fill(tag);
          ctx.strokeStyle = "#2d2926";
          ctx.lineWidth = 2.6;
          ctx.lineJoin = "round";
          ctx.stroke(tag);
          ctx.fillStyle = "#563e79";
          ctx.textAlign = "center";
          ctx.fillText(label, tw / 2, th * 0.68);
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
            drawSpark(ctx, sx, sy, 4.5 * sizeF + 2, t * 3 + k);
          }
          // a little drawn tag above the creature, with a drawn star on it
          const hint = "magic dust…";
          ctx.font = `800 ${Math.round(11 * sizeF) + 7}px 'Baloo 2', sans-serif`;
          const hw = Math.round(ctx.measureText(hint).width + 46);
          const hh = 30;
          const hy = -R - 30 + Math.sin(t * 2.2) * 3;
          const tag = tagPath(hw, hh, 613);
          ctx.globalAlpha = 0.95;
          ctx.save();
          ctx.translate(-hw / 2, hy - hh / 2);
          ctx.fillStyle = "#ffd65a";
          ctx.fill(tag);
          ctx.strokeStyle = "#2d2926";
          ctx.lineWidth = 2.2;
          ctx.lineJoin = "round";
          ctx.stroke(tag);
          ctx.fillStyle = "#2d2926";
          drawSpark(ctx, 17, hh / 2, 3.6, t * 1.8);
          ctx.textAlign = "center";
          ctx.fillText(hint, hw / 2 + 10, hh * 0.68);
          ctx.restore();
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
        drawSpark(ctx, s.x, s.y, 4 * s.life + 1, t * 4);
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
    pushBanner(`Say hello to ${name}!`, "pencil");
  }, [onRenameCreature, pushBanner]);

  const releaseCreature = useCallback((c: Creature) => {
    if (onDeleteCreature) onDeleteCreature(c.id);
    else {
      editedRef.current = true;
      setReleased((s) => new Set(s).add(c.id));
    }
    sfxSplash();
    pushBanner(`${c.name} went off to explore. Bye!`, "globe");
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

  /* ── share card ───────────────────────────────────────────────────────────
     This is the artifact that leaves the app, so it is built the same way the
     rest of the interface is: a real sheet of paper, the world taped into it,
     the wordmark laid down in wax. */
  const doShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    sfxTap();
    try {
      const src = canvasRef.current;
      if (!src || !src.width || !src.height) return;
      const CW = 1200, CH = 900;
      const card = document.createElement("canvas");
      card.width = CW; card.height = CH;
      const ctx = card.getContext("2d");
      if (!ctx) return;

      /* the ground: warm stock with fibre, lit from above */
      ctx.fillStyle = "#f7e8ca";
      ctx.fillRect(0, 0, CW, CH);
      const fibre = await loadImage(paperTile());
      if (fibre) {
        const pat = ctx.createPattern(fibre, "repeat");
        if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, CW, CH); }
      }
      const lit = ctx.createLinearGradient(0, 0, 0, CH);
      lit.addColorStop(0, "rgba(255,255,255,0.5)");
      lit.addColorStop(0.5, "rgba(255,255,255,0)");
      lit.addColorStop(1, "rgba(186,158,113,0.32)");
      ctx.fillStyle = lit;
      ctx.fillRect(0, 0, CW, CH);

      /* the world, taped into the book, cropped to fill (never squashed) */
      const mw = 1044, mh = 524;
      const my = 142;
      const srcAR = src.width / src.height;
      const dstAR = mw / mh;
      let sw = src.width, sh = src.height, sx = 0, sy = 0;
      if (srcAR > dstAR) { sw = src.height * dstAR; sx = (src.width - sw) / 2; }
      else { sh = src.width / dstAR; sy = (src.height - sh) / 2; }

      ctx.save();
      ctx.translate(CW / 2, my + mh / 2);
      ctx.rotate(-0.013);
      ctx.translate(-mw / 2, -mh / 2);
      const frame = new Path2D(roughRect(mw, mh, { seed: 12, wobble: 9, radius: 20 }));
      ctx.save();
      ctx.shadowColor = "rgba(74,58,40,0.34)";
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = "#fffdf7";
      ctx.fill(frame);
      ctx.restore();
      ctx.save();
      ctx.clip(frame);
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, mw, mh);
      ctx.restore();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = "#2d2926";
      ctx.lineWidth = 7;
      ctx.stroke(frame);
      // the pen goes over the line a second time, and never in the same place
      ctx.save();
      ctx.translate(1.5, 2);
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 4;
      ctx.stroke(new Path2D(roughRect(mw, mh, { seed: 103, wobble: 9, radius: 20 })));
      ctx.restore();
      // washi tape over two corners
      const tape = (x: number, y: number, rot: number, color: string) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = color;
        const w = 176, h = 50;
        ctx.beginPath();
        ctx.moveTo(-w / 2, -h / 2);
        ctx.lineTo(w / 2, -h / 2);
        for (let i = 1; i <= 5; i++) ctx.lineTo(w / 2 + (i % 2 ? -8 : 8), -h / 2 + (h * i) / 5);
        ctx.lineTo(-w / 2, h / 2);
        for (let i = 4; i >= 0; i--) ctx.lineTo(-w / 2 + (i % 2 ? 8 : -8), -h / 2 + (h * i) / 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      tape(46, -6, -0.42, "#ffd98e");
      tape(mw - 46, mh + 6, -0.42, "#a8e6f0");
      ctx.restore();

      /* the headline, written on the page */
      const star = newCreature ? `“${newCreature.name}” came alive!` : "Look what I drew — it’s ALIVE!";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = "800 58px 'Baloo 2', Nunito, sans-serif";
      ctx.fillStyle = "#563e79";
      ctx.fillText(star, CW / 2, 92);
      // a crayon swoosh under it — drawn, not stroked
      const uw = Math.min(CW - 220, ctx.measureText(star).width + 24);
      const ur = hand(seedOf(star));
      const upts = Array.from({ length: 22 }, (_, i) => {
        const p = i / 21;
        return { x: CW / 2 - uw / 2 + uw * p, y: 116 + Math.sin(p * 3.1) * 5 + (ur() - 0.5) * 4 };
      });
      drawCrayonStroke(ctx, upts, "#ffc72c", 13, 17);

      /* the wordmark, laid down letter by letter in wax colours */
      const WORD = "MAGIC PEN";
      const HUES: (string | null)[] = ["#e63b2e", "#ff7a1a", "#ffc72c", "#3aae3a", "#2f6fe4", null, "#8b46c7", "#fb66e5", "#00c2b9"];
      ctx.font = "800 34px 'Baloo 2', Nunito, sans-serif";
      ctx.fillStyle = "#7a6a58";
      ctx.fillText("made with", CW / 2, 736);
      ctx.font = "800 66px 'Baloo 2', Nunito, sans-serif";
      const widths = [...WORD].map((ch) => ctx.measureText(ch).width + 3);
      const total = widths.reduce((a, b) => a + b, 0);
      let cx = CW / 2 - total / 2;
      const wr = hand(451);
      ctx.textAlign = "left";
      [...WORD].forEach((ch, i) => {
        const w = widths[i];
        if (ch !== " ") {
          ctx.save();
          ctx.translate(cx + w / 2, 812 + (wr() - 0.5) * 7);
          ctx.rotate((wr() - 0.5) * 0.1);
          ctx.lineJoin = "round";
          ctx.lineWidth = 8;
          ctx.strokeStyle = "#2d2926";
          ctx.strokeText(ch, -w / 2, 0);
          ctx.fillStyle = HUES[i] ?? "#2d2926";
          ctx.fillText(ch, -w / 2, 0);
          ctx.restore();
        }
        cx += w;
      });
      ctx.textAlign = "center";
      // two drawn stars flanking the mark
      ctx.fillStyle = "#ffc72c";
      drawSpark(ctx, CW / 2 - total / 2 - 46, 790, 13, 0.3);
      drawSpark(ctx, CW / 2 + total / 2 + 46, 790, 13, -0.4);
      ctx.font = "700 26px Nunito, sans-serif";
      ctx.fillStyle = "#8a7a68";
      ctx.fillText("draw it · it lives", CW / 2, 858);

      /* torn off a pad: the bottom edge is never straight */
      const torn = new Path2D(`${tornEdge(CW, 16, 21)} L${CW} 60 L0 60 Z`);
      ctx.save();
      ctx.translate(0, CH - 22);
      ctx.fillStyle = "rgba(176,148,104,0.45)";
      ctx.fill(torn);
      ctx.restore();

      const blob = await new Promise<Blob | null>((res) => card.toBlob(res, "image/png"));
      if (!blob) { pushBanner("Hmm — the photo didn't come out. Try again!", "camera"); return; }
      const file = new File([blob], "magic-pen.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "MAGIC PEN", text: "My drawing came alive!" });
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
      pushBanner("Saved your world as a picture!", "camera");
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
  const toggleSound = () => { const m = !muted; setM(m); setMuted(m); sfxTap(); };
  const emptyLine = WORLD_EMPTY[worldId] ?? WORLD_EMPTY.ocean;
  const prompts = (WORLD_PACKS.find((p) => p.id === worldId) ?? WORLD_PACKS[0]).prompts;
  const padX = { paddingLeft: "max(12px, env(safe-area-inset-left))", paddingRight: "max(12px, env(safe-area-inset-right))" };
  const bannerInk = BANNER_INK[banner?.icon ?? "sparkle"] ?? { color: "#2d2926" };

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
        <div className="flex items-start gap-1.5 sm:gap-2">
          <HudBtn
            round
            icon="home"
            seed={41}
            aria-label="Back to home"
            onClick={() => { sfxTap(); onBack(); }}
          />
          <div className="flex-1" />
          <HudBtn
            round
            className="hud-roomy"
            icon={muted ? "soundOff" : "soundOn"}
            seed={77}
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            aria-pressed={!muted}
            onClick={toggleSound}
          />
          <HudBtn
            round
            className="hud-roomy"
            icon="camera"
            seed={12}
            disabled={sharing}
            aria-label="Share a photo of your world"
            onClick={() => void doShare()}
          />
          {view.length > 0 && (
            <HudBtn
              icon="gamepad"
              tone={TONE.play}
              seed={205}
              labelWide="Play"
              aria-label="Play mini-games"
              onClick={() => { sfxHappy(); onPlayGame(); }}
            />
          )}
          <HudBtn
            icon="pencil"
            tone={TONE.draw}
            seed={331}
            label="Draw"
            labelWide=" more!"
            aria-label="Draw another creature"
            onClick={() => { sfxHappy(); onDrawMore(); }}
          />
          <HudBtn
            round
            icon="more"
            seed={509}
            aria-label="More world options"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => { sfxTap(); setMenuOpen((o) => !o); }}
          />
        </div>

        {menuOpen && (
          <>
            <button
              className="fixed inset-0 z-10 pointer-events-auto cursor-default"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
            <div className="relative z-20 mt-2 flex justify-end pointer-events-auto">
              <InkCard
                className="hud-sheet hud-drop p-2 w-60 max-w-full grid gap-1"
                seed={63}
                weight={3.2}
                role="menu"
                aria-label="World options"
              >
                <PaperFibre inset={6} radius={22} />
                <div className="relative grid gap-1">
                  {([
                    {
                      key: "sound",
                      icon: (muted ? "soundOff" : "soundOn") as IconName,
                      text: muted ? "Sound is off" : "Sound is on",
                      onClick: toggleSound,
                      disabled: false,
                    },
                    {
                      key: "share",
                      icon: "camera" as IconName,
                      text: sharing ? "Making photo…" : "Share a photo",
                      onClick: () => { setMenuOpen(false); void doShare(); },
                      disabled: sharing,
                    },
                    {
                      key: "friends",
                      icon: "heart" as IconName,
                      text: `My friends (${view.length})`,
                      onClick: () => { sfxTap(); setMenuOpen(false); setSheet({ mode: "roster" }); },
                      disabled: false,
                    },
                  ]).map((it) => (
                    <button
                      key={it.key}
                      role="menuitem"
                      onClick={it.onClick}
                      disabled={it.disabled}
                      className="hud-focus hud-menu-item h-12 px-2.5 flex items-center gap-2.5 text-left disabled:opacity-50"
                    >
                      <Icon name={it.icon} size={22} color="var(--plum)" fill={it.icon === "heart" ? "#ff6b6b" : undefined} />
                      <span className="ink-title" style={{ fontSize: "var(--fs-sm)" }}>{it.text}</span>
                    </button>
                  ))}
                </div>
              </InkCard>
            </div>
          </>
        )}
      </div>

      {/* ── banner queue: a note taped into the book ── */}
      {banner && (
        <div
          className="absolute inset-x-0 z-10 flex justify-center pointer-events-none"
          style={{ ...padX, top: "calc(max(10px, env(safe-area-inset-top)) + 62px)" }}
        >
          <div key={banner.id} className="anim-spring-pop max-w-[94%]">
            <div className="hud-drop" style={{ transform: "rotate(-1.2deg)" }}>
              <InkCard className="px-4 py-2.5" seed={seedOf(banner.text)} weight={3.2} role="status">
                <Tape
                  seed={banner.id % 5}
                  style={{ width: 78, height: 26, top: -13, left: "50%", marginLeft: -39, transform: "rotate(-4deg)" }}
                />
                <PaperFibre inset={5} radius={20} />
                <div className="relative flex items-center gap-2">
                  <span className="shrink-0">
                    <Icon name={banner.icon} size={24} color={bannerInk.color} fill={bannerInk.fill} weight={2.2} />
                  </span>
                  <span className="ink-title" style={{ fontSize: "var(--fs-md)" }}>{banner.text}</span>
                </div>
              </InkCard>
            </div>
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
        <HudBtn
          icon="heart"
          iconFill="#ff6b6b"
          tone={TONE.sun}
          seed={823}
          label={`${view.length} ${view.length === 1 ? "friend" : "friends"}`}
          className="anim-rise-in z-20"
          /* `.ink-btn` sets `position: relative`, so the placement has to be
             stated inline or the chip lands back in the flow. */
          style={{
            position: "absolute",
            left: "max(12px, env(safe-area-inset-left))",
            bottom: "max(12px, env(safe-area-inset-bottom))",
          }}
          aria-label={`Open your friends list — ${view.length} creatures`}
          onClick={() => { sfxTap(); setSheet({ mode: "roster" }); }}
        />
      )}

      {/* ── empty state: an actual invitation ── */}
      {view.length === 0 && (
        <div className="absolute inset-0 z-10 grid place-items-center p-4 pointer-events-none" style={padX}>
          <div className="hud-fade-in hud-drop pointer-events-auto w-full" style={{ maxWidth: 340 }}>
            <InkCard className="px-5 pt-7 pb-5 text-center" seed={seedOf(worldId)} weight={3.4}>
              <Tape seed={2} style={{ width: 74, height: 24, top: -12, left: 14, transform: "rotate(-10deg)" }} />
              <Tape seed={4} style={{ width: 74, height: 24, top: -12, right: 14, transform: "rotate(9deg)" }} />
              <PaperFibre inset={8} radius={26} />

              <div className="relative">
                {/* the mount where the first drawing will go */}
                <div className="mx-auto mt-1 relative hud-motion anim-float-y hud-short-hide" style={{ width: 132, height: 104 }}>
                  <InkShape
                    w={132}
                    h={104}
                    seed={311}
                    weight={2.6}
                    double={false}
                    lifted={false}
                    ink="rgba(86,62,121,0.38)"
                    fill={{ kind: "none" }}
                  />
                  <div className="absolute inset-0 grid place-items-center">
                    <Icon name="pencil" size={42} color="var(--plum)" weight={2.1} />
                  </div>
                </div>

                <h2 className="ink-title mt-2" style={{ fontSize: "var(--fs-2xl)" }}>{emptyLine}</h2>
                <div className="px-8"><Scribble color="var(--sun)" height={10} seed={9} /></div>
                <p className="ink-hand mt-1" style={{ fontSize: "var(--fs-sm)" }}>
                  Draw one thing and watch it come alive right here.
                </p>

                <div className="flex flex-wrap justify-center gap-1.5 my-3">
                  {prompts.slice(0, 3).map((p, i) => (
                    <span key={p} className="hud-slip" style={{ "--tilt": `${(i - 1) * 1.6}deg` } as React.CSSProperties}>
                      {p}
                    </span>
                  ))}
                </div>

                {/* the pulse lives on the wrapper so the button keeps its press feel */}
                <div className="hud-invite hud-motion">
                  <InkButton
                    tone={TONE.draw.wax}
                    seed={57}
                    className="w-full"
                    style={{ height: 62, padding: "0 12px" }}
                    onClick={() => { sfxHappy(); onDrawMore(); }}
                  >
                    <Icon name="pencil" size={23} color="#fff6e6" weight={2.3} />
                    <span className="ink-on-wax font-display font-extrabold whitespace-nowrap" style={{ fontSize: "var(--fs-lg)" }}>
                      Draw my first friend!
                    </span>
                  </InkButton>
                </div>
              </div>
            </InkCard>
          </div>
        </div>
      )}

      {/* ── roster / detail sheet: the sketchbook their drawings live in ── */}
      {sheet && (
        <div
          className="hud-scrim absolute inset-0 z-30 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={sheet.mode === "roster" ? "Your friends" : "Creature card"}
          onPointerDown={(e) => { if (e.target === e.currentTarget) setSheet(null); }}
        >
          <InkCard
            className="hud-sheet w-full max-w-md"
            seed={sheet.mode === "roster" ? 21 : 34}
            weight={3.6}
            style={{ margin: 12, marginBottom: "max(12px, env(safe-area-inset-bottom))" }}
          >
            <PaperFibre inset={9} radius={30} />
            <div className="relative p-3">
              <div className="flex items-center gap-2">
                {sheet.mode === "detail" && (
                  <InkButton
                    shape="ellipse"
                    seed={88}
                    className="hud-focus shrink-0"
                    style={{ width: 48, height: 48, padding: 0 }}
                    onClick={() => { sfxTap(); setSheet({ mode: "roster" }); }}
                    aria-label="Back to your friends list"
                  >
                    <Icon name="back" size={22} color="var(--ink)" />
                  </InkButton>
                )}
                <h2 className="ink-title flex-1 min-w-0 flex items-center gap-2" style={{ fontSize: "var(--fs-xl)" }}>
                  {sheet.mode === "roster" ? (
                    <>
                      <span className="shrink-0"><Icon name="heart" size={22} color="#2d2926" fill="#ff6b6b" /></span>
                      <span className="truncate min-w-0">My friends</span>
                      <span className="hud-tally">{view.length}</span>
                    </>
                  ) : (
                    <span className="truncate min-w-0">{detail ? detail.name : "…"}</span>
                  )}
                </h2>
                <InkButton
                  shape="ellipse"
                  seed={140}
                  className="hud-focus shrink-0"
                  style={{ width: 48, height: 48, padding: 0 }}
                  onClick={() => { sfxTap(); setSheet(null); }}
                  aria-label="Close"
                >
                  <Icon name="close" size={20} color="var(--ink)" weight={2.6} />
                </InkButton>
              </div>
              <div className="px-2 -mt-0.5">
                <Scribble color="rgba(45,41,38,0.3)" height={9} seed={23} />
              </div>

              {sheet.mode === "roster" && (
                <div
                  className="overflow-y-auto hud-scroll hud-fade-edge pt-2 pb-2 px-1 grid gap-3.5 content-start"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", maxHeight: "min(46vh, 400px)" }}
                >
                  {view.map((c, i) => {
                    const k = kindById(c.kindId);
                    const s = seedOf(c.id);
                    const tilt = ((s % 100) / 100 - 0.5) * 8;
                    return (
                      <button
                        key={c.id}
                        onClick={() => openDetail(c)}
                        className="hud-tilt hud-focus relative"
                        style={{ "--tilt": `${tilt.toFixed(2)}deg` } as React.CSSProperties}
                        aria-label={`Open ${c.name} the ${k.label}`}
                      >
                        <InkCard className="p-1.5 pt-3 grid place-items-center gap-0.5" seed={s % 900} weight={2.6}>
                          <Tape
                            seed={i + 1}
                            style={{ width: 52, height: 19, top: -9, left: "50%", marginLeft: -26, transform: `rotate(${(tilt * -2.4).toFixed(1)}deg)` }}
                          />
                          <div className="h-16 grid place-items-center">
                            <CreatureThumb creature={c} sprite={spritesRef.current.get(c.id)?.frames[0] ?? null} size={62} tick={artTick} />
                          </div>
                          <div className="ink-title truncate w-full text-center" style={{ fontSize: 11, color: "var(--ink)" }}>{c.name}</div>
                          <div className="ink-hand truncate w-full text-center" style={{ fontSize: 10 }}>{k.label}</div>
                        </InkCard>
                        {polishRef.current.has(c.id) && !c.artUrl && (
                          <span className="absolute -top-1.5 -right-1 z-30">
                            <Icon name="sparkle" size={20} color="#2d2926" fill="#ffc72c" weight={1.8} />
                            <span className="visually-hidden">getting magic dust</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {sheet.mode === "detail" && detail && (
                <div className="overflow-y-auto hud-scroll px-1 pt-3 pb-1" style={{ maxHeight: "min(50vh, 430px)" }}>
                  {/* their artwork, taped into the book */}
                  <div className="grid place-items-center">
                    <div style={{ transform: "rotate(-1.6deg)" }}>
                      <InkCard className="p-3" seed={(seedOf(detail.id) + 17) % 900} weight={3}>
                        <Tape seed={2} style={{ width: 82, height: 26, top: -13, left: -16, transform: "rotate(-26deg)" }} />
                        <Tape seed={4} style={{ width: 82, height: 26, bottom: -13, right: -16, transform: "rotate(-24deg)" }} />
                        <PaperFibre inset={5} radius={22} />
                        <div className="relative grid place-items-center">
                          <CreatureThumb creature={detail} sprite={spritesRef.current.get(detail.id)?.frames[0] ?? null} size={132} tick={artTick} />
                        </div>
                      </InkCard>
                    </div>
                  </div>
                  <p className="ink-hand text-center mt-4" style={{ fontSize: "var(--fs-sm)" }}>
                    {kindById(detail.kindId).label} · joined {new Date(detail.createdAt).toLocaleDateString()}
                  </p>

                  <label className="block mt-3 ink-title" style={{ fontSize: "var(--fs-sm)" }} htmlFor="creature-name">
                    Name
                  </label>
                  <div className="flex gap-2 mt-1.5">
                    <InkCard className="flex-1 min-w-0" seed={412} weight={2.8} lifted={false}>
                      <input
                        id="creature-name"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value.slice(0, MAX_NAME))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename(detail, nameDraft); } }}
                        maxLength={MAX_NAME}
                        autoComplete="off"
                        className="hud-focus w-full h-12 bg-transparent px-3 font-display font-extrabold outline-none"
                        style={{ fontSize: "var(--fs-lg)", color: "var(--ink)" }}
                        aria-label="Creature name"
                      />
                    </InkCard>
                    <InkButton
                      tone={TONE.play.wax}
                      seed={655}
                      className="hud-focus shrink-0"
                      style={{ height: 52 }}
                      onClick={() => commitRename(detail, nameDraft)}
                      disabled={!nameDraft.trim() || nameDraft.trim() === detail.name}
                    >
                      <Icon name="check" size={20} color="#fff6e6" weight={2.6} />
                      <span className="ink-on-wax font-display font-extrabold" style={{ fontSize: "var(--fs-md)" }}>Save</span>
                    </InkButton>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <InkButton
                      seed={721}
                      className="hud-focus"
                      style={{ height: 52 }}
                      onClick={() => {
                        const rt = rtRef.current.get(detail.id);
                        if (rt) { rt.excite = 1; rt.labelT = performance.now() + 260; }
                        sfxPop();
                        setSheet(null);
                      }}
                    >
                      <Icon name="sparkle" size={20} color="#2d2926" fill="#ffc72c" weight={2} />
                      <span className="ink-title" style={{ fontSize: "var(--fs-md)" }}>Say hi</span>
                    </InkButton>
                    <InkButton
                      tone={TONE.play.wax}
                      seed={809}
                      className="hud-focus"
                      style={{ height: 52 }}
                      onClick={() => { sfxHappy(); onPlayGame(); }}
                    >
                      <Icon name="gamepad" size={20} color="#fff6e6" weight={2.2} />
                      <span className="ink-on-wax font-display font-extrabold" style={{ fontSize: "var(--fs-md)" }}>Play</span>
                    </InkButton>
                  </div>

                  {!confirmDel ? (
                    <button
                      onClick={() => { sfxTap(); setConfirmDel(true); }}
                      className="hud-focus mt-4 mb-1 w-full h-12 flex items-center justify-center gap-2"
                      style={{ color: "var(--coral)" }}
                    >
                      <Icon name="globe" size={19} color="var(--coral)" weight={2.1} />
                      <span className="font-display font-bold underline underline-offset-4" style={{ fontSize: "var(--fs-sm)" }}>
                        Let {detail.name} go…
                      </span>
                    </button>
                  ) : (
                    <ReleaseConfirm
                      name={detail.name}
                      onKeep={() => { sfxTap(); setConfirmDel(false); }}
                      onRelease={() => releaseCreature(detail)}
                    />
                  )}
                </div>
              )}
            </div>
          </InkCard>
        </div>
      )}

      {/* how-to-touch tip, then it gets out of the way */}
      {tip && view.length > 0 && !sheet && (
        <div
          className="hud-hint absolute z-10 pointer-events-none flex justify-center inset-x-0 px-4"
          style={{ bottom: "max(76px, calc(env(safe-area-inset-bottom) + 76px))" }}
        >
          {/* a paper slip: the worlds behind this are busy, and the reef bed in
              particular swallowed the bare text entirely */}
          <span className="hud-slip hud-slip-note">tap a friend to say hi · hold to open its card</span>
        </div>
      )}
    </div>
  );
}

/* ── letting a creature go: never silent, never one tap ──────────────────── */
function ReleaseConfirm({
  name, onKeep, onRelease,
}: { name: string; onKeep: () => void; onRelease: () => void }) {
  const [ref, box] = useBox<HTMLDivElement>();
  // a destructive choice must never open below the fold
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [ref]);
  return (
    <div ref={ref} className="relative isolate mt-4 mb-1 p-3 text-center">
      <InkShape
        w={box.w}
        h={box.h}
        seed={950}
        weight={3}
        lifted={false}
        ink="var(--coral)"
        fill={{ kind: "none" }}
      />
      <div className="relative">
        <p className="ink-title" style={{ fontSize: "var(--fs-md)" }}>Really let {name} go?</p>
        <p className="ink-hand mb-2.5" style={{ fontSize: "var(--fs-2xs)" }}>This drawing can't come back.</p>
        <div className="grid grid-cols-2 gap-2">
          <InkButton seed={31} className="hud-focus" style={{ height: 50 }} onClick={onKeep}>
            <Icon name="heart" size={20} color="#2d2926" fill="#3aae3a" weight={2} />
            <span className="ink-title" style={{ fontSize: "var(--fs-md)" }}>Keep!</span>
          </InkButton>
          <InkButton tone={TONE.go.wax} seed={97} className="hud-focus" style={{ height: 50 }} onClick={onRelease}>
            <Icon name="globe" size={20} color="#fff6e6" weight={2.2} />
            <span className="ink-on-wax font-display font-extrabold" style={{ fontSize: "var(--fs-md)" }}>Let go</span>
          </InkButton>
        </div>
      </div>
    </div>
  );
}
