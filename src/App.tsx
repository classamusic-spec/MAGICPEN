import { useEffect, useMemo, useRef, useState } from "react";
import type { Creature, RecognitionResult, Screen, Stroke } from "@/lib/types";
import { recognize } from "@/lib/recognizer";
import { kindById, WORLD_PACKS } from "@/lib/creatures";
import { loadCreatures, saveCreatures, hasSeenIntro, markSeenIntro, uuid } from "@/lib/storage";
import { trpc } from "@/providers/trpc";
import { bakeSketchPNG, proxyArtUrl } from "@/lib/polish";
import Splash from "@/components/Splash";
import Home from "@/components/Home";
import DrawScreen from "@/components/DrawScreen";
import MagicReveal from "@/components/MagicReveal";
import WorldScene from "@/components/WorldScene";
import MiniGame from "@/components/MiniGame";

function pickName(kindId: string, taken: Set<string>): string {
  const pool = kindById(kindId).names;
  const free = pool.filter((n) => !taken.has(n));
  const src = free.length ? free : pool;
  return src[Math.floor(Math.random() * src.length)];
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(hasSeenIntro() ? "home" : "splash");
  const [worldId, setWorldId] = useState<string>("ocean");
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
    let image: string;
    try {
      image = creature.photoData ?? bakeSketchPNG(creature.strokes);
    } catch { return; }
    const jobId = creature.id;
    const label = kindById(creature.kindId).label.toLowerCase();
    const client = utils.client;
    const done = () => setPolishingIds((prev) => { const n = new Set(prev); n.delete(jobId); return n; });
    setPolishingIds((prev) => new Set(prev).add(jobId));
    console.info("[polish] started for", creature.name);
    client.polish.start
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

  const result: RecognitionResult = useMemo(
    () => (draft.length ? recognize(draft) : { kindId: "mystery", confidence: 0, alternatives: [] }),
    [draft]
  );

  const prompt = useMemo(() => {
    const pack = WORLD_PACKS.find((p) => p.id === worldId) ?? WORLD_PACKS[0];
    const p = pack.prompts;
    return p[Math.floor(Math.random() * p.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen === "draw"]);

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

  const enterClass =
    screen === "world" ? "screen-enter-dive" : screen === "draw" || screen === "reveal" ? "screen-enter-rise" : "screen-enter-fade";

  return (
    <div className="h-full w-full overflow-hidden">
      <div key={screen} className={`h-full ${enterClass}`}>
        {screen === "splash" && (
          <Splash onStart={() => { markSeenIntro(); setScreen("home"); }} />
        )}
        {screen === "home" && (
          <Home
            creatures={creatures}
            onPlayWorld={(id) => { setWorldId(id); setScreen("world"); }}
            onDraw={() => setScreen("draw")}
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
            polishingIds={polishingIds}
            onBack={() => { setNewId(null); setScreen("home"); }}
            onDrawMore={() => { setNewId(null); setScreen("draw"); }}
            onPlayGame={() => { setNewId(null); setScreen("game"); }}
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
