// ─── Mini-games shell: pick a game + your hero creature, then play ──────────
// Game mechanics live in @/lib/games; this file owns the screens: the console
// style game-select, the 3·2·1·GO count-in, the in-round HUD (score, hearts,
// combo, clock), pause/resume, and the results moment.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Creature } from "@/lib/types";
import { kindById, WORLD_PACKS } from "@/lib/creatures";
import { drawOcean, drawSpace, drawFarm, drawDino, newFxState, floorRatio } from "./world/themes";
import { sampleFrame, clearLayers } from "./world/shared";
import { bakeCrayonSprite } from "@/lib/sprites";
import { artSprite, onArtLoaded, stickerizeImage } from "@/lib/polish";
import { loadBest, saveBest } from "@/lib/storage";
import { sfxPop, sfxSplash, sfxHappy, sfxMagic, sfxTap } from "@/lib/audio";
import { WORLD_GAMES, createGame, type Frame, type GameAPI, type GameInstance, type Input } from "@/lib/games";
import { Juice } from "@/lib/games/juice";
import { Thumb } from "./Home";

const ROUND_S = 60;
const COUNT_IN = 3.2;   // seconds of "3 · 2 · 1 · GO!"
const RESUME_IN = 1.4;  // shorter count-in when un-pausing

type Stage = "choose" | "play" | "over";

/** Per-game box art: a stable colour skin so every game card has an identity. */
const GAME_SKINS: Record<string, string> = {
  bubbleGulp: "linear-gradient(150deg,#22d3ee,#0a4d8f)",
  coralGlide: "linear-gradient(150deg,#fb66e5,#ff8a5c)",
  crabTap: "linear-gradient(150deg,#ff8a5c,#e0245e)",
  starRush: "linear-gradient(150deg,#8b46c7,#151040)",
  astroLanes: "linear-gradient(150deg,#6595f9,#151040)",
  orbitHop: "linear-gradient(150deg,#c084fc,#5b21b6)",
  eggCatch: "linear-gradient(150deg,#ffd65a,#84cc16)",
  moleMash: "linear-gradient(150deg,#a3e635,#3f6212)",
  pumpkinPunt: "linear-gradient(150deg,#fb923c,#8b46c7)",
  lavaLeap: "linear-gradient(150deg,#ff6b6b,#2d1b4e)",
  meteorDodge: "linear-gradient(150deg,#38bdf8,#ff8a5c)",
  cliffHopper: "linear-gradient(150deg,#34d399,#065f46)",
};
const SKIN_FALLBACK = [
  "linear-gradient(150deg,#00c2b9,#563e79)",
  "linear-gradient(150deg,#ffc72c,#ff6b6b)",
  "linear-gradient(150deg,#6595f9,#8b46c7)",
];
const skinFor = (id: string, i: number) => GAME_SKINS[id] ?? SKIN_FALLBACK[i % SKIN_FALLBACK.length];

const reduced = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Neutral input + silent API used while the round is frozen (count-in). */
const IDLE_INPUT: Input = { down: false, x: 0.5, y: 0.5 };
const SILENT_API: GameAPI = {
  score: () => {}, hurt: () => {}, inv: () => true, blip: () => {},
  burst: () => {}, pop: () => {}, shake: () => {}, combo: () => 1,
};

/** Resolve the best available hero canvas: AI art → photo sticker → crayon. */
function useHeroCanvas(c: Creature | null) {
  const [cv, setCv] = useState<HTMLCanvasElement | null>(null);
  const [artTick, bumpArt] = useState(0);
  useEffect(() => onArtLoaded(() => bumpArt((n) => n + 1)), []);
  useEffect(() => {
    let live = true;
    if (!c) { setCv(null); return; }
    if (c.artUrl) {
      const art = artSprite(c.artUrl);
      if (art) { setCv(art); return; }
    }
    if (c.photoData) {
      const im = new Image();
      im.onload = () => {
        if (!live) return;
        const S = Math.min(1, 160 / Math.max(im.width, im.height));
        const tmp = document.createElement("canvas");
        tmp.width = Math.max(1, Math.round(im.width * S));
        tmp.height = Math.max(1, Math.round(im.height * S));
        tmp.getContext("2d")!.drawImage(im, 0, 0, tmp.width, tmp.height);
        setCv(stickerizeImage(tmp));
      };
      im.src = c.photoData;
      return () => { live = false; };
    }
    setCv(bakeCrayonSprite(c).frames[0]);
    return () => { live = false; };
    // artTick re-runs this once the AI art finishes downloading
  }, [c, artTick]);
  return cv;
}

/** Eased count-up for the results score. */
function useCountUp(target: number, run: boolean, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) { setV(0); return; }
    if (reduced() || target <= 0) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - u, 3))));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
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
  const meta = games[Math.min(gameIdx, games.length - 1)] ?? games[0];
  const worldName = useMemo(
    () => WORLD_PACKS.find((p) => p.id === worldId)?.name ?? "Your world",
    [worldId],
  );

  // newest creature is the one the kid just made — the friendliest default hero
  const [hero, setHero] = useState<Creature | null>(creatures.length ? creatures[creatures.length - 1] : null);
  const [stage, setStage] = useState<Stage>("choose");
  const [paused, setPaused] = useState(false);
  const [countLabel, setCountLabel] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hurtSeq, setHurtSeq] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [prevBest, setPrevBest] = useState(0);
  const [endReason, setEndReason] = useState<"time" | "hearts">("time");
  const [bests, setBests] = useState<Record<string, number>>(() => loadBest());
  const heroCv = useHeroCanvas(hero);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resumeBtnRef = useRef<HTMLButtonElement>(null);
  const heroSelRef = useRef<HTMLButtonElement>(null);
  const ptr = useRef<Input>({ down: false, x: 0.5, y: 0.5 });
  const gameRef = useRef<GameInstance | null>(null);
  const frameRef = useRef<Frame | null>(null);
  const fxRef = useRef(newFxState());
  const juiceRef = useRef(new Juice());
  const pausedRef = useRef(false);
  const countRef = useRef<string | null>(null);
  const sceneT = useRef(0); // wall clock for the backdrop — never rewinds
  /** Round state lives in a ref: the 60fps loop must not re-render React. */
  const gs = useRef({ score: 0, hearts: 3, left: ROUND_S, inv: 0, over: false, freeze: COUNT_IN, gt: 0 });
  const [hud, setHud] = useState({ score: 0, hearts: 3, left: ROUND_S, combo: 0 });

  /* ── round lifecycle ──────────────────────────────────────────────────── */

  const start = useCallback(() => {
    if (!hero) return;
    sfxMagic();
    gs.current = { score: 0, hearts: 3, left: ROUND_S, inv: 0, over: false, freeze: COUNT_IN, gt: 0 };
    gameRef.current = createGame(meta.id);
    fxRef.current = newFxState();
    juiceRef.current.reset();
    ptr.current = { down: false, x: 0.5, y: 0.5 };
    sceneT.current = 0;
    countRef.current = null;
    pausedRef.current = false;
    setCountLabel(null);
    setPaused(false);
    setHurtSeq(0);
    setHint(gameRef.current.hint ?? meta.how);
    setHud({ score: 0, hearts: 3, left: ROUND_S, combo: 0 });
    setStage("play");
  }, [hero, meta]);

  /** Leave the round without finishing it — safe to call at any time. */
  const quitRound = useCallback(() => {
    gs.current.over = true;
    pausedRef.current = false;
    ptr.current.down = false;
    countRef.current = null;
    setPaused(false);
    setCountLabel(null);
    setHint(null);
    setBests(loadBest());
    setStage("choose");
  }, []);

  const pause = useCallback(() => {
    if (pausedRef.current || gs.current.over) return;
    pausedRef.current = true;
    ptr.current.down = false;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    gs.current.freeze = Math.max(gs.current.freeze, RESUME_IN);
    countRef.current = null;
    setCountLabel(null);
    setPaused(false);
    sfxTap();
  }, []);

  /* ── the round loop ───────────────────────────────────────────────────── */
  // Deps cover everything the loop reads from props/state; round progress lives
  // in refs, so a restart (art loaded, un-pause, resize) resumes seamlessly.
  useEffect(() => {
    if (stage !== "play" || paused || !hero) return;
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;

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
    let hudT = 0;

    const juice = juiceRef.current;
    const syncHud = () => setHud({
      score: gs.current.score,
      hearts: gs.current.hearts,
      left: Math.max(0, Math.ceil(gs.current.left)),
      combo: juice.multiplier(),
    });

    const endRound = (reason: "time" | "hearts") => {
      if (gs.current.over) return;
      gs.current.over = true;
      ptr.current.down = false;
      countRef.current = null;
      const before = loadBest()[meta.id] ?? 0;
      setPrevBest(before);
      setFinalScore(gs.current.score);
      setEndReason(reason);
      setNewBest(saveBest(meta.id, gs.current.score));
      setBests(loadBest());
      setCountLabel(null);
      setHint(null);
      sfxHappy();
      setStage("over");
    };

    const api: GameAPI = {
      score: (n: number) => {
        const mult = juice.hit();
        gs.current.score += n * mult;
        sfxPop();
        if (mult > 1 && juice.comboCount() % 3 === 0) sfxHappy();
      },
      blip: () => sfxTap(),
      inv: () => gs.current.inv > 0,
      hurt: () => {
        if (gs.current.inv > 0 || gs.current.over) return;
        gs.current.hearts -= 1;
        gs.current.inv = 1.3;
        juice.breakCombo();
        juice.shake(0.55);
        sfxSplash();
        if ("vibrate" in navigator) navigator.vibrate(35);
        /* hearts are rare and must feel instant — sync the HUD off-throttle */
        syncHud();
        setHurtSeq((n) => n + 1);
        if (gs.current.hearts <= 0) endRound("hearts");
      },
      burst: (x, y, color, count) => juice.burst(x, y, color, count),
      pop: (x, y, text, color) => juice.pop(x, y, text, color),
      shake: (amount) => juice.shake(amount),
      combo: () => juice.multiplier(),
    };

    const loop = (now: number) => {
      const game = gameRef.current;
      if (!game || gs.current.over || pausedRef.current) return;
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      sampleFrame(dt);
      sceneT.current += dt;
      const wallT = sceneT.current;
      const dpr = window.devicePixelRatio || 1;
      const ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const floorY = H * floorRatio(worldId);
      const sizeF = Math.min(W, H) / 520;

      /* count-in: the world stays alive, the game does not tick yet */
      const frozen = gs.current.freeze > 0;
      if (frozen) {
        gs.current.freeze -= dt;
        const f = gs.current.freeze;
        const label = f > 2.2 ? "3" : f > 1.4 ? "2" : f > 0.6 ? "1" : "GO!";
        if (label !== countRef.current) {
          countRef.current = label;
          setCountLabel(label);
          if (label === "GO!") sfxHappy(); else sfxTap();
        }
      } else if (countRef.current !== null) {
        countRef.current = null;
        setCountLabel(null);
      }
      const gdt = frozen ? 0 : dt;
      gs.current.gt += gdt;
      const frame: Frame = { W, H, t: gs.current.gt, dt: gdt, sizeF, floorY };
      frameRef.current = frame;

      /* screen shake wraps the whole world + entities, never the HUD */
      juice.update(gdt);
      ctx.save();
      juice.applyShake(ctx, sizeF);

      /* the living world as the backdrop */
      const themeFrame = { ctx, W, H, t: wallT, floorY };
      if (worldId === "space") drawSpace(themeFrame, fxRef.current, dt);
      else if (worldId === "farm") drawFarm(themeFrame, fxRef.current, dt);
      else if (worldId === "dino") drawDino(themeFrame, fxRef.current, dt);
      else drawOcean(themeFrame, fxRef.current, dt);

      /* round clock (paused during the count-in) */
      if (!frozen) {
        gs.current.left -= dt;
        if (gs.current.left <= 0) { gs.current.left = 0; ctx.restore(); endRound("time"); return; }
        gs.current.inv = Math.max(0, gs.current.inv - dt);
      }

      /* game logic + entities */
      game.update(frame, frozen ? IDLE_INPUT : ptr.current, frozen ? SILENT_API : api);
      game.draw(ctx, frame);

      /* the hero — the kid's own creature */
      const blink = gs.current.inv > 0 && Math.floor(wallT * 14) % 2 === 0;
      ctx.save();
      ctx.globalAlpha = blink ? 0.35 : 1;
      ctx.translate(game.heroX, game.heroY);
      ctx.rotate(game.tilt * 0.6);
      const breathe = 1 + Math.sin(wallT * 3) * 0.03;
      ctx.scale(breathe, 1 / breathe);
      if (heroCv) {
        const hh = 96 * frame.sizeF * game.heroScale;
        const hw = (hh * heroCv.width) / heroCv.height;
        ctx.drawImage(heroCv, -hw / 2, -hh / 2, hw, hh);
      }
      ctx.restore();

      /* game overlay painted in front of the hero (aim lines, charge meters) */
      game.drawFront?.(ctx, frame);

      /* juice: particles + floating score text ride above every entity */
      juice.draw(ctx, frame.sizeF);
      ctx.restore(); // end screen shake

      /* HUD sync (throttled — React never runs in the hot path) */
      hudT += dt;
      if (hudT > 0.12) { hudT = 0; syncHud(); }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [stage, paused, hero, heroCv, meta.id, worldId]);

  /* cached scenery layers are shared with WorldScene — drop them on unmount */
  useEffect(() => () => { gs.current.over = true; clearLayers(); }, []);

  /* auto-pause: switching apps must never burn the round clock */
  useEffect(() => {
    if (stage !== "play") return;
    const onHidden = () => { if (document.visibilityState === "hidden") pause(); };
    const onBlur = () => pause();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (pausedRef.current) resume(); else pause();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKey);
    };
  }, [stage, pause, resume]);

  /* the hint has said its piece — take it out of the DOM */
  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), 5200);
    return () => window.clearTimeout(t);
  }, [hint]);

  /* keyboard players land on "keep playing" when the pause card opens */
  useEffect(() => {
    if (paused) resumeBtnRef.current?.focus();
  }, [paused]);

  /* bring the chosen hero into view when the picker appears */
  useEffect(() => {
    if (stage !== "choose") return;
    heroSelRef.current?.scrollIntoView({
      inline: "center", block: "nearest", behavior: reduced() ? "auto" : "smooth",
    });
  }, [stage, hero]);

  const stars = finalScore >= 150 ? 3 : finalScore >= 80 ? 2 : finalScore > 0 ? 1 : 0;
  const shownScore = useCountUp(finalScore, stage === "over");

  /* results: stars land one at a time */
  useEffect(() => {
    if (stage !== "over" || reduced()) return;
    const ids: number[] = [];
    for (let i = 0; i < stars; i++) ids.push(window.setTimeout(() => sfxPop(), 420 + i * 280));
    if (newBest) ids.push(window.setTimeout(() => sfxMagic(), 480 + stars * 280));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [stage, stars, newBest]);

  /* ── pointer plumbing ─────────────────────────────────────────────────── */
  const setPtr = (e: React.PointerEvent, down: boolean | null) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    ptr.current.x = (e.clientX - r.left) / Math.max(1, r.width);
    ptr.current.y = (e.clientY - r.top) / Math.max(1, r.height);
    if (down !== null) ptr.current.down = down;
  };
  const live = () => !pausedRef.current && !gs.current.over && gs.current.freeze <= 0;
  const onDown = (e: React.PointerEvent) => {
    if (!live()) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    setPtr(e, true);
    if (frameRef.current) gameRef.current?.onDown?.(frameRef.current, ptr.current);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!ptr.current.down) { setPtr(e, false); return; }
    setPtr(e, false);
    if (live() && frameRef.current) gameRef.current?.onUp?.(frameRef.current);
  };

  const kind = hero ? kindById(hero.kindId) : null;
  const padX = { paddingLeft: "max(12px, env(safe-area-inset-left))", paddingRight: "max(12px, env(safe-area-inset-right))" };

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
        />
      )}

      {/* ── in-round HUD ── */}
      {stage === "play" && (
        <div
          className="absolute top-0 inset-x-0 z-10 flex items-start gap-2 pointer-events-none"
          style={{ ...padX, paddingTop: "max(10px, env(safe-area-inset-top))" }}
        >
          <div className="flex flex-col items-start gap-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { sfxTap(); pause(); }}
                className="sticker-btn hud-focus hud-tap pointer-events-auto bg-white rounded-full w-12 h-12 grid place-items-center text-lg text-[var(--plum)]"
                aria-label="Pause game"
              >
                ⏸
              </button>
              <div className="sticker-card px-3 h-11 flex items-center font-display font-extrabold text-lg text-[var(--plum)] tabular-nums">
                ⭐ {hud.score}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                key={hurtSeq}
                className={`sticker-card px-2.5 h-9 flex items-center gap-0.5 ${hurtSeq > 0 ? "hud-heart-row" : ""}`}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className={`text-base leading-none ${hurtSeq > 0 && i === hud.hearts ? "hud-heart-lost" : ""}`}
                    style={{ opacity: i < hud.hearts ? 1 : 0.45 }}
                  >
                    {i < hud.hearts ? "❤️" : "🤍"}
                  </span>
                ))}
                <span className="sr-only" role="status">{hud.hearts} hearts left</span>
              </div>
              {hud.combo > 1 && (
                <div
                  key={hud.combo}
                  className="sticker-card anim-spring-pop px-2.5 h-9 flex items-center font-display font-black text-base text-white"
                  style={{ background: "linear-gradient(120deg,#fb66e5,#ffc72c)" }}
                >
                  ×{hud.combo}
                </div>
              )}
            </div>
          </div>
          <div className="flex-1" />
          <div
            className={`sticker-card px-3 h-11 flex items-center font-display font-extrabold text-lg tabular-nums ${
              hud.left <= 10 ? "text-white hud-motion" : "text-[var(--plum)]"
            }`}
            style={hud.left <= 10 ? { background: "var(--coral)", animation: "glow-pulse 1s ease-in-out infinite" } : undefined}
          >
            ⏱ {hud.left}s
          </div>
        </div>
      )}

      {/* hit reaction wash */}
      {stage === "play" && hurtSeq > 0 && (
        <div key={hurtSeq} className="hud-hurt-flash absolute inset-0 z-10 pointer-events-none" />
      )}

      {/* ── count-in + coaching hint ── */}
      {stage === "play" && !paused && countLabel && (
        <div className="absolute inset-0 z-20 grid place-items-center pointer-events-none">
          <div
            key={countLabel}
            className="hud-count font-display font-black text-white"
            style={{
              fontSize: "clamp(64px, 20vmin, 160px)",
              textShadow: "0 6px 0 var(--ink), 0 0 34px rgba(255,199,44,0.85)",
              animationDuration: countLabel === "GO!" ? "0.6s" : "0.85s",
            }}
          >
            {countLabel}
          </div>
        </div>
      )}
      {stage === "play" && !paused && hint && (
        <div className="absolute inset-x-0 top-[58%] z-20 flex justify-center pointer-events-none" style={padX}>
          <div className="hud-hint sticker-card px-4 py-2 max-w-[92%] text-center font-bold text-sm sm:text-base text-[var(--plum)]">
            💡 {hint}
          </div>
        </div>
      )}

      {/* ── pause ── */}
      {stage === "play" && paused && (
        <div
          className="hud-scrim absolute inset-0 z-30 grid place-items-center p-3"
          role="dialog"
          aria-modal="true"
          aria-label="Game paused"
        >
          <div className="hud-sheet sticker-card w-full max-w-xs p-4 text-center max-h-full overflow-y-auto hud-scroll">
            <div className="text-3xl" aria-hidden="true">⏸</div>
            <h2 className="font-display font-extrabold text-2xl text-[var(--plum)] leading-tight">Paused</h2>
            <p className="font-bold text-sm text-[var(--muted-foreground)] mb-3 tabular-nums">
              ⭐ {hud.score} · ⏱ {hud.left}s left
            </p>
            <button
              ref={resumeBtnRef}
              onClick={resume}
              className="sticker-btn hud-focus w-full h-14 rounded-full font-display font-extrabold text-xl text-white mb-2"
              style={{ background: "linear-gradient(120deg,#00c2b9,#3aae3a 120%)" }}
            >
              ▶ Keep playing
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { sfxTap(); start(); }}
                className="sticker-btn hud-focus h-12 rounded-full bg-white font-display font-bold text-[var(--plum)]"
              >
                🔁 Restart
              </button>
              <button
                onClick={() => { sfxTap(); quitRound(); }}
                className="sticker-btn hud-focus h-12 rounded-full bg-white font-display font-bold text-[var(--plum)]"
              >
                🎮 Games
              </button>
            </div>
            <button
              onClick={() => { sfxTap(); quitRound(); onBack(); }}
              className="hud-focus mt-2 w-full h-12 rounded-full font-display font-bold text-[var(--plum)] underline underline-offset-4"
            >
              🏠 Back to my world
            </button>
          </div>
        </div>
      )}

      {/* ── game select ── */}
      {stage === "choose" && (
        <div className="h-full paper-grain flex flex-col" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
          <header className="shrink-0 flex items-center gap-2.5 pb-2" style={padX}>
            <button
              onClick={() => { sfxTap(); onBack(); }}
              className="sticker-btn hud-focus hud-tap bg-white rounded-full w-12 h-12 grid place-items-center text-xl text-[var(--plum)]"
              aria-label="Back to your world"
            >
              ←
            </button>
            <div className="min-w-0">
              <h1 className="font-display font-extrabold text-xl sm:text-2xl text-[var(--plum)] leading-none truncate">
                Game time! 🎮
              </h1>
              <p className="text-xs font-bold text-[var(--muted-foreground)] truncate">{worldName}</p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto hud-scroll" style={padX}>
            <h2 className="font-display font-extrabold text-base text-[var(--plum)] mb-1.5">Choose a game</h2>
            <div
              role="radiogroup"
              aria-label="Choose a game"
              className="grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
            >
              {games.map((gm, i) => {
                const sel = i === gameIdx;
                const b = bests[gm.id] ?? 0;
                return (
                  <button
                    key={gm.id}
                    role="radio"
                    aria-checked={sel}
                    aria-label={`${gm.title}. ${gm.how} ${b > 0 ? `Best score ${b}` : "You have not played this one yet"}`}
                    onClick={() => { setGameIdx(i); sfxTap(); }}
                    className="hud-tile hud-focus sticker-card overflow-hidden text-left"
                    style={{
                      animationDelay: `${i * 45}ms`,
                      outline: sel ? "4px solid var(--sun)" : undefined,
                      outlineOffset: "2px",
                    }}
                  >
                    <div className="h-16 grid place-items-center relative" style={{ background: skinFor(gm.id, i) }}>
                      <span className="text-3xl" aria-hidden="true" style={{ filter: "drop-shadow(0 3px 0 rgba(45,41,38,0.35))" }}>
                        {gm.emoji}
                      </span>
                      {b === 0 && (
                        <span className="absolute top-1 left-1 bg-[var(--sun)] text-[var(--ink)] text-[10px] font-display font-black px-1.5 py-0.5 rounded-full border-2 border-[var(--ink)] rotate-[-6deg]">
                          NEW!
                        </span>
                      )}
                      {sel && (
                        <span className="absolute top-1 right-1 bg-white text-[var(--plum)] w-6 h-6 grid place-items-center rounded-full border-2 border-[var(--ink)] text-xs font-black" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="font-display font-extrabold text-sm text-[var(--plum)] truncate">{gm.title}</div>
                      <div className="hud-clamp-2 text-[11px] font-bold text-[var(--muted-foreground)] leading-tight min-h-[26px]">
                        {gm.how}
                      </div>
                      <div className="mt-1 text-[11px] font-extrabold text-[var(--ink)] tabular-nums">
                        {b > 0 ? `🏆 best ${b}` : "✨ never played"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {creatures.length > 0 ? (
              <>
                <h2 className="font-display font-extrabold text-base text-[var(--plum)] mt-4 mb-1.5 flex items-baseline gap-2">
                  Pick your hero
                  <span className="text-xs font-bold text-[var(--muted-foreground)]">
                    {creatures.length} {creatures.length === 1 ? "friend" : "friends"}
                  </span>
                </h2>
                <div
                  role="radiogroup"
                  aria-label="Pick your hero"
                  className="flex gap-4 overflow-x-auto hud-scroll snap-x pt-4 pb-3 -mx-2 px-2"
                >
                  {creatures.map((c) => {
                    const sel = hero?.id === c.id;
                    const k = kindById(c.kindId);
                    return (
                      <button
                        key={c.id}
                        ref={sel ? heroSelRef : undefined}
                        role="radio"
                        aria-checked={sel}
                        aria-label={`Play as ${c.name} the ${k.label}`}
                        onClick={() => { setHero(c); sfxTap(); }}
                        className="hud-focus sticker-card relative snap-center shrink-0 w-24 p-1.5 grid gap-1 place-items-center"
                        style={{ outline: sel ? "4px solid var(--sun)" : undefined, outlineOffset: "2px" }}
                      >
                        <div className="h-14 w-full grid place-items-center overflow-hidden [&>canvas]:max-h-full [&>canvas]:max-w-full">
                          <Thumb c={c} />
                        </div>
                        <div className="text-[11px] font-extrabold text-[var(--ink)] truncate w-full text-center">{c.name}</div>
                        <div className="text-[10px] font-bold text-[var(--muted-foreground)] truncate w-full text-center">
                          {k.emoji} {k.label}
                        </div>
                        {sel && (
                          <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xl" aria-hidden="true">👑</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="sticker-card p-4 text-center my-4">
                <div className="text-3xl mb-1" aria-hidden="true">✏️</div>
                <p className="font-display font-extrabold text-[var(--plum)]">Draw a friend first!</p>
                <p className="text-sm font-bold text-[var(--muted-foreground)]">Your creature is the star of every game.</p>
              </div>
            )}
          </div>

          <footer className="shrink-0 pt-2" style={{ ...padX, paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
            <button
              onClick={start}
              disabled={!hero || !heroCv}
              className="sticker-btn btn-sheen hud-motion hud-focus w-full h-14 rounded-full font-display font-extrabold text-xl text-white disabled:opacity-50 flex items-center justify-center px-4"
              style={{ background: "linear-gradient(120deg,#00c2b9,#3aae3a 120%)" }}
            >
              <span className="truncate">{hero ? `Go, ${hero.name}! 🎮` : "Pick a hero!"}</span>
            </button>
          </footer>
        </div>
      )}

      {/* ── results ── */}
      {stage === "over" && hero && kind && (
        <div
          className="h-full paper-grain overflow-y-auto hud-scroll grid place-items-center"
          style={{ ...padX, paddingTop: "max(12px, env(safe-area-inset-top))", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <div className="hud-sheet sticker-card w-full max-w-sm p-4 sm:p-5 text-center">
            <div className="text-4xl sm:text-5xl leading-none" aria-hidden="true">
              {stars >= 3 ? "🏆" : stars === 2 ? "🎉" : "🌟"}
            </div>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-[var(--plum)] leading-tight">
              {endReason === "hearts" ? "Out of hearts!" : "Time's up!"}
            </h2>

            <div className="flex justify-center gap-1.5 my-1.5 text-3xl" role="img" aria-label={`${stars} out of 3 stars`}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={i < stars ? "hud-star inline-block" : "inline-block"}
                  style={i < stars ? { animationDelay: `${0.35 + i * 0.28}s` } : { opacity: 0.3 }}
                >
                  {i < stars ? "⭐" : "☆"}
                </span>
              ))}
            </div>

            <div className="font-display font-extrabold text-5xl text-[var(--ink)] tabular-nums leading-none" aria-live="polite">
              {shownScore}
            </div>
            <div className="font-bold text-sm text-[var(--muted-foreground)] mt-1 truncate">
              {hero.name} the {kind.label} · {meta.title}
            </div>

            {newBest ? (
              <div className="hud-ribbon mt-2.5 inline-block sticker-btn bg-[var(--sun)] rounded-full px-4 py-1.5 font-display font-extrabold text-[var(--ink)]">
                🏆 NEW BEST!{prevBest > 0 && <span className="font-bold text-xs"> (was {prevBest})</span>}
              </div>
            ) : prevBest > 0 ? (
              <div className="mt-2.5">
                <div className="h-3 w-full rounded-full border-[3px] border-[var(--ink)] bg-white overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, Math.min(100, (finalScore / prevBest) * 100))}%`,
                      background: "linear-gradient(120deg,#8b46c7,#fb66e5)",
                      transition: reduced() ? undefined : "width 0.9s cubic-bezier(0.22,1,0.36,1)",
                    }}
                  />
                </div>
                <div className="mt-1 text-xs font-extrabold text-[var(--muted-foreground)] tabular-nums">
                  {finalScore >= prevBest
                    ? `you matched your best of ${prevBest}!`
                    : `${prevBest - finalScore} more to beat your best of ${prevBest}`}
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-2">
              <button
                onClick={() => { sfxTap(); start(); }}
                className="sticker-btn btn-sheen hud-motion hud-focus w-full h-14 rounded-full font-display font-extrabold text-xl text-white"
                style={{ background: "linear-gradient(120deg,#8b46c7,#fb66e5)" }}
              >
                🔁 Play again!
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { sfxTap(); setBests(loadBest()); setStage("choose"); }}
                  className="sticker-btn hud-focus h-12 rounded-full bg-white font-display font-bold text-[var(--plum)] px-2"
                >
                  🎮 New game
                </button>
                <button
                  onClick={() => { sfxTap(); onBack(); }}
                  className="sticker-btn hud-focus h-12 rounded-full bg-white font-display font-bold text-[var(--plum)] px-2"
                >
                  🏠 My world
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
