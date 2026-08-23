import { useEffect, useMemo, useRef, useState } from "react";
import type { Creature, DreamWorld, RecognitionResult, Screen, Stroke, WritingWorldId } from "@/lib/types";
import { recognize } from "@/lib/recognizer";
import { kindById, rosterFor, WORLD_PACKS } from "@/lib/creatures";
import { loadCreatures, saveCreatures, hasSeenIntro, markSeenIntro, uuid, loadDream, saveDream } from "@/lib/storage";
import { markVisit, dailyIdea, welcomeBack, type Visit } from "@/lib/daily";
import { trpc } from "@/providers/trpc";
import { bakeSketchPNG, proxyArtUrl } from "@/lib/polish";
import { doodlePNG } from "@/lib/doodleArt";
import Splash from "@/components/Splash";
import Home from "@/components/Home";
import DrawScreen from "@/components/DrawScreen";
import MagicReveal from "@/components/MagicReveal";
import WorldScene from "@/components/WorldScene";
import MiniGame from "@/components/MiniGame";
import WriteWorld from "@/components/WriteWorld";
import PaintWorld from "@/components/PaintWorld";

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
    <div className="h-full w-full overflow-hidden">
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
    </div>
  );
}
