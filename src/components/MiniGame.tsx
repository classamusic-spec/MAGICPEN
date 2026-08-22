// ─── Mini-games shell: pick a game + your hero creature, then play ──────────
// Game mechanics live in @/lib/games; this file handles screens, HUD, hearts,
// the round timer, best scores, the pointer, and drawing the hero itself.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Creature } from "@/lib/types";
import { kindById } from "@/lib/creatures";
import { drawOcean, drawSpace, drawFarm, drawDino, newFxState, floorRatio } from "./world/themes";
import { bakeCrayonSprite } from "@/lib/sprites";
import { artSprite, onArtLoaded, stickerizeImage } from "@/lib/polish";
import { loadBest, saveBest } from "@/lib/storage";
import { sfxPop, sfxSplash, sfxHappy, sfxMagic, sfxTap } from "@/lib/audio";
import { WORLD_GAMES, createGame, type Frame, type GameInstance, type Input } from "@/lib/games";
import { Thumb } from "./Home";

const ROUND_S = 60;

/** Resolve the best available hero canvas: AI art → photo sticker → crayon. */
function useHeroCanvas(c: Creature | null) {
  const [cv, setCv] = useState<HTMLCanvasElement | null>(null);
  const [, tick] = useState(0);
  useEffect(() => onArtLoaded(() => tick((n) => n + 1)), []);
  useEffect(() => {
    if (!c) { setCv(null); return; }
    if (c.artUrl) {
      const art = artSprite(c.artUrl);
      if (art) { setCv(art); return; }
    }
    if (c.photoData) {
      const im = new Image();
      im.onload = () => {
        const S = Math.min(1, 160 / Math.max(im.width, im.height));
        const tmp = document.createElement("canvas");
        tmp.width = Math.max(1, Math.round(im.width * S));
        tmp.height = Math.max(1, Math.round(im.height * S));
        tmp.getContext("2d")!.drawImage(im, 0, 0, tmp.width, tmp.height);
        setCv(stickerizeImage(tmp));
      };
      im.src = c.photoData;
      return;
    }
    setCv(bakeCrayonSprite(c).frames[0]);
  }, [c, tick]);
  return cv;
}

export default function MiniGame({
  worldId,
  creatures,
  onBack,
}: {
  worldId: string;
  creatures: Creature[];
  onBack: () => void;
}) {
  const games = WORLD_GAMES[worldId] ?? WORLD_GAMES.ocean;
  const [gameIdx, setGameIdx] = useState(0);
  const [hero, setHero] = useState<Creature | null>(creatures.length === 1 ? creatures[0] : null);
  const [stage, setStage] = useState<"choose" | "play" | "over">("choose");
  const [finalScore, setFinalScore] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const meta = games[gameIdx];
  const heroCv = useHeroCanvas(hero);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ptr = useRef<Input>({ down: false, x: 0.5, y: 0.5 });
  const gameRef = useRef<GameInstance | null>(null);
  const frameRef = useRef<Frame | null>(null);
  const fxRef = useRef(newFxState());
  const gs = useRef({ score: 0, hearts: 3, left: ROUND_S, inv: 0, over: false });
  const [hud, setHud] = useState({ score: 0, hearts: 3, left: ROUND_S });

  const best = useMemo(() => loadBest()[meta.id] ?? 0, [meta.id, stage]);

  const start = () => {
    if (!hero) return;
    sfxMagic();
    gs.current = { score: 0, hearts: 3, left: ROUND_S, inv: 0, over: false };
    gameRef.current = createGame(meta.id);
    fxRef.current = newFxState();
    setHud({ score: 0, hearts: 3, left: ROUND_S });
    setStage("play");
  };

  // main loop
  useEffect(() => {
    if (stage !== "play" || !hero) return;
    const cv = canvasRef.current!;
    const wrap = wrapRef.current!;
    let raf = 0;
    let W = 0, H = 0;
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
    let lastT = performance.now();
    const startT = lastT;
    let hudT = 0;

    const endRound = () => {
      if (gs.current.over) return;
      gs.current.over = true;
      setFinalScore(gs.current.score);
      setNewBest(saveBest(meta.id, gs.current.score));
      sfxHappy();
      setStage("over");
    };

    const api = {
      score: (n: number) => { gs.current.score += n; sfxPop(); },
      blip: () => sfxTap(),
      inv: () => gs.current.inv > 0,
      hurt: () => {
        if (gs.current.inv > 0 || gs.current.over) return;
        gs.current.hearts -= 1;
        gs.current.inv = 1.3;
        sfxSplash();
        if (gs.current.hearts <= 0) endRound();
      },
    };

    const loop = (now: number) => {
      const game = gameRef.current;
      if (!game || gs.current.over) return;
      const t = (now - startT) / 1000;
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const dpr = window.devicePixelRatio || 1;
      const ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const floorY = H * floorRatio(worldId);
      const frame: Frame = { W, H, t, dt, sizeF: Math.min(W, H) / 520, floorY };
      frameRef.current = frame;

      /* the living world as the backdrop */
      const themeFrame = { ctx, W, H, t, floorY };
      if (worldId === "space") drawSpace(themeFrame, fxRef.current, dt);
      else if (worldId === "farm") drawFarm(themeFrame, fxRef.current, dt);
      else if (worldId === "dino") drawDino(themeFrame, fxRef.current, dt);
      else drawOcean(themeFrame, fxRef.current, dt);

      /* round clock */
      gs.current.left -= dt;
      if (gs.current.left <= 0) { endRound(); return; }
      gs.current.inv = Math.max(0, gs.current.inv - dt);

      /* game logic + entities */
      game.update(frame, ptr.current, api);
      game.draw(ctx, frame);

      /* the hero — the kid's own creature */
      const blink = gs.current.inv > 0 && Math.floor(t * 14) % 2 === 0;
      ctx.save();
      ctx.globalAlpha = blink ? 0.35 : 1;
      ctx.translate(game.heroX, game.heroY);
      ctx.rotate(game.tilt * 0.6);
      const breathe = 1 + Math.sin(t * 3) * 0.03;
      ctx.scale(breathe, 1 / breathe);
      if (heroCv) {
        const hh = 96 * frame.sizeF * game.heroScale;
        const hw = (hh * heroCv.width) / heroCv.height;
        ctx.drawImage(heroCv, -hw / 2, -hh / 2, hw, hh);
      }
      ctx.restore();

      /* HUD sync (throttled) */
      hudT += dt;
      if (hudT > 0.2) {
        hudT = 0;
        setHud({ score: gs.current.score, hearts: gs.current.hearts, left: Math.ceil(gs.current.left) });
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, hero, heroCv, meta.id]);

  /* pointer plumbing */
  const setPtr = (e: React.PointerEvent, down: boolean | null) => {
    const r = wrapRef.current!.getBoundingClientRect();
    ptr.current.x = (e.clientX - r.left) / r.width;
    ptr.current.y = (e.clientY - r.top) / r.height;
    if (down !== null) ptr.current.down = down;
  };
  const onDown = (e: React.PointerEvent) => {
    setPtr(e, true);
    if (frameRef.current) gameRef.current?.onDown?.(frameRef.current, ptr.current);
  };
  const onUp = (e: React.PointerEvent) => {
    setPtr(e, false);
    if (frameRef.current) gameRef.current?.onUp?.(frameRef.current);
  };

  const kind = hero ? kindById(hero.kindId) : null;
  const stars = finalScore >= 150 ? 3 : finalScore >= 80 ? 2 : finalScore > 0 ? 1 : 0;

  return (
    <div ref={wrapRef} className="h-full relative overflow-hidden select-none">
      {stage === "play" && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 canvas-touch"
          onPointerDown={onDown}
          onPointerMove={(e) => setPtr(e, null)}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
        />
      )}

      {/* HUD during play */}
      {stage === "play" && (
        <div className="absolute top-0 inset-x-0 p-3 flex items-center gap-2 pointer-events-none">
          <button
            onClick={() => { sfxTap(); gs.current.over = true; setStage("choose"); }}
            className="sticker-btn pointer-events-auto bg-white rounded-full w-9 h-9 grid place-items-center text-base font-black text-[var(--plum)]"
            aria-label="Quit game"
          >
            ✕
          </button>
          <div className="sticker-card px-3 py-1.5 font-display font-extrabold text-lg text-[var(--plum)]">
            ⭐ {hud.score}
          </div>
          <div className="sticker-card px-3 py-1.5 text-base tracking-wide">
            {Array.from({ length: 3 }, (_, i) => (i < hud.hearts ? "❤️" : "🤍")).join("")}
          </div>
          <div className="flex-1" />
          <div className="sticker-card px-3 py-1.5 font-display font-extrabold text-lg text-[var(--plum)]">
            ⏱ {hud.left}s
          </div>
        </div>
      )}

      {/* choose game + hero */}
      {stage === "choose" && (
        <div className="h-full paper-grain flex flex-col items-center justify-center p-4 overflow-y-auto">
          {/* game picker chips */}
          <div className="flex gap-2 mb-3 flex-wrap justify-center">
            {games.map((gm, i) => (
              <button
                key={gm.id}
                onClick={() => { setGameIdx(i); sfxTap(); }}
                className={`sticker-btn rounded-full px-4 py-2 font-display font-extrabold text-sm sm:text-base ${
                  i === gameIdx ? "text-white" : "bg-white text-[var(--plum)]"
                }`}
                style={i === gameIdx ? { background: "linear-gradient(120deg,#8b46c7,#fb66e5)" } : undefined}
              >
                {gm.emoji} {gm.title}
              </button>
            ))}
          </div>
          <p className="font-bold text-[var(--muted-foreground)] mb-3 text-center max-w-sm">{meta.how}</p>
          <div className="font-display font-bold text-[var(--plum)] mb-2">Pick your hero!</div>
          <div className="flex flex-wrap justify-center gap-3 max-w-lg mb-3">
            {creatures.map((c) => (
              <button
                key={c.id}
                onClick={() => { setHero(c); sfxTap(); }}
                className={`sticker-card hover-lift w-24 p-2 grid place-items-center gap-1 ${
                  hero?.id === c.id ? "ring-4 ring-[var(--sun)]" : ""
                }`}
              >
                <div className="h-16 grid place-items-center"><Thumb c={c} /></div>
                <div className="text-xs font-extrabold text-[var(--ink)] truncate w-full text-center">{c.name}</div>
                <div className="text-[10px] font-bold text-[var(--muted-foreground)]">{kindById(c.kindId).emoji} {kindById(c.kindId).label}</div>
              </button>
            ))}
          </div>
          {best > 0 && (
            <div className="font-display font-bold text-[var(--plum)] mb-3">🏆 best at {meta.title}: {best}</div>
          )}
          <div className="flex gap-3 pb-2">
            <button onClick={() => { sfxTap(); onBack(); }} className="sticker-btn bg-white rounded-full px-5 py-3 font-display font-bold text-lg text-[var(--plum)]">
              ← Back
            </button>
            <button
              onClick={start}
              disabled={!hero || !heroCv}
              className="sticker-btn btn-sheen anim-glow-pulse rounded-full px-8 py-3 font-display font-extrabold text-xl text-white disabled:opacity-50"
              style={{ background: "linear-gradient(120deg,#00c2b9,#3aae3a 120%)" }}
            >
              {hero ? `Go, ${hero.name}! 🎮` : "Pick one!"}
            </button>
          </div>
        </div>
      )}

      {/* game over */}
      {stage === "over" && hero && kind && (
        <div className="h-full paper-grain grid place-items-center p-5">
          <div className="sticker-card p-6 text-center max-w-sm w-full anim-spring-pop">
            <div className="text-5xl mb-1">{stars >= 3 ? "🏆" : stars === 2 ? "🎉" : "🌟"}</div>
            <h2 className="font-display font-extrabold text-3xl text-[var(--plum)]">Time's up!</h2>
            <div className="text-3xl my-2 tracking-widest">{"⭐".repeat(stars)}{"☆".repeat(3 - stars)}</div>
            <div className="font-display font-extrabold text-4xl text-[var(--ink)]">{finalScore}</div>
            <div className="font-bold text-[var(--muted-foreground)]">
              {hero.name} the {kind.label} · {meta.title}
            </div>
            {newBest && (
              <div className="mt-2 inline-block sticker-btn bg-[var(--sun)] rounded-full px-4 py-1 font-display font-extrabold text-[var(--ink)] rotate-2">
                🏆 NEW BEST!
              </div>
            )}
            {!newBest && best > 0 && <div className="mt-2 font-bold text-[var(--muted-foreground)]">best: {best}</div>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => { sfxTap(); onBack(); }} className="sticker-btn flex-1 bg-white rounded-full py-3 font-display font-bold text-lg text-[var(--plum)]">
                🏠 World
              </button>
              <button
                onClick={() => { setStage("choose"); sfxTap(); }}
                className="sticker-btn btn-sheen flex-1 rounded-full py-3 font-display font-extrabold text-lg text-white"
                style={{ background: "linear-gradient(120deg,#8b46c7,#fb66e5)" }}
              >
                🔁 Again!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
