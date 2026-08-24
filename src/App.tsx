import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Creature, DreamWorld, RecognitionResult, Screen, Stroke, WritingWorldId } from "@/lib/types";
import { recognize } from "@/lib/recognizer";
import { kindById, rosterFor, WORLD_PACKS } from "@/lib/creatures";
import { loadCreatures, saveCreatures, hasSeenIntro, markSeenIntro, uuid, loadDream, saveDream } from "@/lib/storage";
import { markVisit, dailyIdea, welcomeBack, type Visit } from "@/lib/daily";
import { CARE_PER_DAY } from "@/lib/social";
import { trpc } from "@/providers/trpc";
import { bakeSketchPNG, proxyArtUrl } from "@/lib/polish";
import { doodlePNG } from "@/lib/doodleArt";
import ErrorBoundary from "@/components/ErrorBoundary";
import ScreenLoader from "@/components/ScreenLoader";

/* ── what ships in the first byte, and what does not ───────────────────────
   Splash and Home are the first paint, so they stay static imports: making
   them async would put a network round trip in front of the one thing we are
   trying to make fast.

   Everything past them is fetched when the child actually goes there. Between
   them these six screens are the overwhelming majority of the app — the world
   themes alone are thousands of lines of canvas painting that a child who only
   opens the sketchbook never needs.

   No `manualChunks`: Rollup already hoists whatever two or more async entries
   share, and the build bears it out — world/themes + world/shared come out as
   one chunk fetched by whichever of the world or the game is opened first, and
   lib/regions as another shared by the world and the world-painter. What is
   left over (lib/sprites, lib/polish) is not shared *between* the async
   screens at all: eager Home needs both, so they belong in the entry chunk and
   are already paid for. Writing the split by hand could only make that worse. */
import Splash from "@/components/Splash";
import Home from "@/components/Home";

const DrawScreen = lazy(() => import("@/components/DrawScreen"));
const MagicReveal = lazy(() => import("@/components/MagicReveal"));
const WorldScene = lazy(() => import("@/components/WorldScene"));
const MiniGame = lazy(() => import("@/components/MiniGame"));
const WriteWorld = lazy(() => import("@/components/WriteWorld"));
const PaintWorld = lazy(() => import("@/components/PaintWorld"));

function pickName(kindId: string, taken: Set<string>): string {
  const pool = kindById(kindId).names;
  const free = pool.filter((n) => !taken.has(n));
  const src = free.length ? free : pool;
  return src[Math.floor(Math.random() * src.length)];
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(hasSeenIntro() ? "home" : "splash");
  const [worldId, setWorldId] = useState<string>("ocean");
  const [writeWorld, setWriteWorld] = useState<WritingWorldId>("letters");
  const [dream, setDream] = useState<DreamWorld | null>(() => loadDream());
  /* Which world's creatures the reveal screen offers. Drawing from inside a
     world offers that world's things; drawing from the sketchbook offers the
     everyday set, because the child has not picked a world yet. */
  const [drawWorld, setDrawWorld] = useState<string>("dream");
  /* The visit is recorded once per app start. It writes, so it must not happen
     in a render body that React may run twice. */
  const [visit] = useState<Visit>(() => markVisit());
  const [idea] = useState<string>(() => dailyIdea());
  /* Set when the child taps today's idea, so the draw screen asks for that
     instead of a random suggestion. Cleared when they leave the draw screen. */
  const [ideaPrompt, setIdeaPrompt] = useState<string | null>(null);
  const [creatures, setCreatures] = useState<Creature[]>(() => loadCreatures());
  const [draft, setDraft] = useState<Stroke[]>([]);
  const [photoDraft, setPhotoDraft] = useState<string | null>(null);
  const [newId, setNewId] = useState<string | null>(null);
  const [polishingIds, setPolishingIds] = useState<Set<string>>(new Set());
  const utils = trpc.useUtils();
  const worldIdRef = useRef(worldId);
  worldIdRef.current = worldId;

  useEffect(() => { saveCreatures(creatures); }, [creatures]);

  /* ── growing up ───────────────────────────────────────────────────────────
     Every creature that already existed is a day older the first time the app
     is opened on a new day. Deliberately keyed on the *visit*, not on the
     calendar: a creature nobody has seen for a month has not aged a month, it
     has simply been waiting, exactly as it was. The ref survives StrictMode's
     double mount, which would otherwise hand out two days for one. */
  const agedRef = useRef(false);
  useEffect(() => {
    if (!visit.newDay || agedRef.current) return;
    agedRef.current = true;
    setCreatures((prev) => prev.map((c) => ({ ...c, care: (c.care ?? 0) + CARE_PER_DAY })));
  }, [visit.newDay]);

  /** Care earned inside a world — a hello, a trick, a crumb eaten, a friend
   *  made. Arrives in batches on a slow cadence, never per frame. */
  const addCare = (deltas: Record<string, number>) => {
    setCreatures((prev) =>
      prev.map((c) => (deltas[c.id] ? { ...c, care: (c.care ?? 0) + deltas[c.id] } : c)),
    );
  };

  /* ── AI polish: quietly upgrade a creature's crayon art in the background ── */
  const startPolish = (creature: Creature) => {
    let image: string | null;
    try {
      // A word creature has no strokes — its body is a doodle, so that is what
      // the art model gets to redraw.
      image = creature.doodleId
        ? doodlePNG(creature.doodleId)
        : creature.photoData ?? bakeSketchPNG(creature.strokes);
    } catch { return; }
    if (!image) return;
    const jobId = creature.id;
    const label = kindById(creature.kindId).label.toLowerCase();
    const client = utils.client;
    const done = () => setPolishingIds((prev) => { const n = new Set(prev); n.delete(jobId); return n; });
    setPolishingIds((prev) => new Set(prev).add(jobId));
    console.info("[polish] started for", creature.name);
    /* One-shot first: it is the only path that survives a serverless host,
       where the start/status job map does not outlive the request. If the
       server is older (no `run`), fall back to fire-and-poll. */
    client.polish.run
      .mutate({ jobId, image, label, worldId: worldIdRef.current })
      .then((res) => {
        if (res.status === "ready" && res.url) {
          const artUrl = proxyArtUrl(res.url);
          console.info("[polish] ready for", creature.name);
          setCreatures((prev) => prev.map((c) => (c.id === jobId ? { ...c, artUrl } : c)));
          done();
          return;
        }
        console.info("[polish]", res.status, "for", creature.name);
        done();
      })
      .catch(() => pollingFallback());

    const pollingFallback = () => client.polish.start
      .mutate({ jobId, image, label, worldId: worldIdRef.current })
      .then(() => {
        const t0 = Date.now();
        const iv = window.setInterval(() => {
          if (Date.now() - t0 > 180_000) { window.clearInterval(iv); done(); return; }
          client.polish.status
            .query({ jobId })
            .then((st) => {
              if (st.status === "ready" && st.url) {
                window.clearInterval(iv);
                const artUrl = proxyArtUrl(st.url);
                console.info("[polish] ready for", creature.name);
                setCreatures((prev) => prev.map((c) => (c.id === jobId ? { ...c, artUrl } : c)));
                done();
              } else if (st.status === "failed" || st.status === "unavailable") {
                window.clearInterval(iv);
                console.info("[polish]", st.status, "for", creature.name);
                done();
              }
            })
            .catch(() => { /* keep polling */ });
        }, 2500);
      })
      .catch(() => { done(); /* polish is optional — crayon stays */ });
  };

  // retro-polish up to 3 older crayon-only creatures when entering a world
  useEffect(() => {
    if (screen !== "world") return;
    const backlog = creatures.filter((c) => !c.artTried && !c.artUrl).slice(0, 3);
    if (!backlog.length) return;
    setCreatures((prev) => prev.map((c) => (backlog.some((b) => b.id === c.id) ? { ...c, artTried: true } : c)));
    backlog.forEach((c, i) => window.setTimeout(() => startPolish(c), i * 4000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  /* ── warm the game while the child is busy in a world ─────────────────────
     "Play a game" is one tap away from here, and the game is the heaviest
     screen in the app. Fetching it during idle time — after the world has
     finished its own entrance, never competing with it — means the tap lands
     on an already-downloaded chunk. It also warms the chunk the world and the
     game share, so the trip back is free too. Safari has no
     requestIdleCallback, hence the timer. */
  useEffect(() => {
    if (screen !== "world") return;
    const warm = () => { void import("@/components/MiniGame").catch(() => { /* it will be fetched again on tap */ }); };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(t);
  }, [screen]);

  const takenNames = useMemo(() => new Set(creatures.map((c) => c.name)), [creatures]);

  const result: RecognitionResult = useMemo(() => {
    const raw: RecognitionResult = draft.length
      ? recognize(draft)
      : { kindId: "mystery", confidence: 0, alternatives: [] };
    // The recognizer knows nothing about worlds, so its guess can be a fish in
    // outer space. If this world does not offer that creature, fall back to the
    // mystery creature rather than highlighting a card that isn't there.
    const offered = rosterFor(drawWorld).some((k) => k.id === raw.kindId);
    return offered ? raw : { ...raw, kindId: "mystery", confidence: 0 };
  }, [draft, drawWorld]);

  const prompt = useMemo(() => {
    if (ideaPrompt) return ideaPrompt;
    const pack = WORLD_PACKS.find((p) => p.id === drawWorld) ?? WORLD_PACKS[0];
    const p = pack.prompts;
    return p[Math.floor(Math.random() * p.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen === "draw", ideaPrompt, drawWorld]);

  const handleDrawn = (strokes: Stroke[]) => {
    setDraft(strokes);
    setPhotoDraft(null);
    setScreen("reveal");
  };

  const handlePhoto = (photoData: string) => {
    setDraft([]);
    setPhotoDraft(photoData);
    setScreen("reveal");
  };

  const handleConfirm = (kindId: string, name: string) => {
    const creature: Creature = {
      id: uuid(),
      kindId,
      name,
      strokes: draft,
      photoData: photoDraft ?? undefined,
      createdAt: Date.now(),
      wx: 0.5,
      wy: 0.5,
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: 0.03,
      phase: Math.random() * 10,
      scale: 0.75 + Math.random() * 0.45,
      artTried: true,
    };
    setCreatures((prev) => [...prev.slice(-29), creature]);
    setNewId(creature.id);
    setPhotoDraft(null);
    setScreen("world");
    startPolish(creature);
  };

  /* Word World's payoff: the word the child wrote becomes a creature and walks
     straight into their world. It carries `doodleId` instead of strokes, so it
     costs a handful of bytes to store and stays sharp at any size. */
  const handleBorn = ({ word, doodle }: { word: string; doodle: string }) => {
    const creature: Creature = {
      id: uuid(),
      kindId: doodle, // the word kinds are named after their doodles
      name: pickName(doodle, takenNames),
      strokes: [],
      doodleId: doodle,
      word,
      createdAt: Date.now(),
      wx: 0.5,
      wy: 0.5,
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: 0.03,
      phase: Math.random() * 10,
      scale: 0.8 + Math.random() * 0.35,
      artTried: true,
    };
    setCreatures((prev) => [...prev.slice(-29), creature]);
    setNewId(creature.id);
    setScreen("world");
    startPolish(creature);
  };

  const enterClass =
    screen === "world"
      ? "screen-enter-dive"
      : screen === "draw" || screen === "reveal" || screen === "write" || screen === "paintworld"
        ? "screen-enter-rise"
        : "screen-enter-fade";

  return (
    /* The boundary sits outside everything, because a lazy screen that fails to
       download throws during render and there is nothing below it left to
       catch. `resetKey` lets a one-off crash clear itself once the app has
       moved on, rather than poisoning every screen after it. */
    <ErrorBoundary resetKey={screen}>
      <div className="h-full w-full overflow-hidden">
        {/* One boundary around the whole switch: only ever one screen is
            mounted, so a second would buy nothing. */}
        <Suspense fallback={<ScreenLoader />}>
          <div key={screen} className={`h-full ${enterClass}`}>
            {screen === "splash" && (
              <Splash onStart={() => { markSeenIntro(); setScreen("home"); }} />
            )}
            {screen === "home" && (
              <Home
                creatures={creatures}
                onPlayWorld={(id) => {
                  if (id === "dream" && !dream) { setScreen("paintworld"); return; }
                  setWorldId(id);
                  setScreen("world");
                }}
                onDraw={() => { setIdeaPrompt(null); setDrawWorld("dream"); setScreen("draw"); }}
                idea={idea}
                welcome={welcomeBack(visit)}
                onDrawIdea={() => { setIdeaPrompt(idea); setDrawWorld("dream"); setScreen("draw"); }}
                onWrite={(id) => { setWriteWorld(id); setScreen("write"); }}
              />
            )}
            {screen === "draw" && (
              <DrawScreen
                prompt={prompt}
                onDone={handleDrawn}
                onPhoto={handlePhoto}
                onBack={() => setScreen("home")}
              />
            )}
            {screen === "reveal" && (
              <MagicReveal
                strokes={draft}
                result={result}
                photo={photoDraft}
                worldId={drawWorld}
                name={pickName(result.kindId, takenNames)}
                onShuffleName={(k) => pickName(k, takenNames)}
                onConfirm={handleConfirm}
                onRedraw={() => setScreen("draw")}
              />
            )}
            {screen === "world" && (
              <WorldScene
                creatures={creatures}
                newId={newId}
                worldId={worldId}
                dream={dream}
                polishingIds={polishingIds}
                onBack={() => { setNewId(null); setScreen("home"); }}
                onDrawMore={() => { setNewId(null); setIdeaPrompt(null); setDrawWorld(worldId); setScreen("draw"); }}
                onPlayGame={() => { setNewId(null); setScreen("game"); }}
                onRepaint={() => setScreen("paintworld")}
                onCare={addCare}
                visit={visit}
              />
            )}
            {screen === "paintworld" && (
              <PaintWorld
                initial={dream}
                onBack={() => setScreen(dream ? "world" : "home")}
                onDone={(d) => {
                  saveDream(d);
                  setDream(d);
                  setWorldId("dream");
                  setNewId(null);
                  setScreen("world");
                }}
              />
            )}
            {screen === "write" && (
              <WriteWorld
                world={writeWorld}
                onBack={() => setScreen("home")}
                onBorn={handleBorn}
              />
            )}
            {screen === "game" && (
              <MiniGame
                worldId={worldId}
                creatures={creatures}
                onBack={() => setScreen("world")}
              />
            )}
          </div>
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}
