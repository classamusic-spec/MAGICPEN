import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Creature, DreamWorld, RecognitionResult, Screen, Stroke, WritingWorldId } from "@/lib/types";
import { recognize } from "@/lib/recognizer";
import { kindById, rosterFor, WORLD_PACKS } from "@/lib/creatures";
import { loadCreatures, saveCreatures, hasSeenIntro, markSeenIntro, uuid, loadDream, saveDream, loadPet, savePet, clearPet, saveFood, type PetRef } from "@/lib/storage";
import { resolvePet, makeRoom, petGreeting } from "@/lib/pet";
import { remember as rememberInAlbum, forget as forgetFromAlbum, backfill as backfillAlbum } from "@/lib/album";
import { markVisit, dailyIdea, welcomeBack, type Visit } from "@/lib/daily";
import { CARE_PER_DAY } from "@/lib/social";
import { BACK_EVENT } from "@/lib/native";
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
   left over (lib/sprites) is not shared *between* the async
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
const GrownUps = lazy(() => import("@/components/GrownUps"));
const Onboarding = lazy(() => import("@/components/Onboarding"));
const DrawSchool = lazy(() => import("@/components/DrawSchool"));
const StickerBook = lazy(() => import("@/components/StickerBook"));

/**
 * How many creatures swim in a world at once.
 *
 * Not a storage limit (a creature is a few kilobytes of scalars and strokes)
 * and not really a framerate one either now — it is a *legibility*
 * limit. Every creature is a full-size sprite that scales with the screen, so
 * a bigger tablet does not fit more; past the mid-teens the reef disappears
 * under a wall of stickers and a child can no longer pick out one friend to
 * tap. Sixteen reads as "lots of friends" while still leaving water between
 * them on the smallest phone.
 *
 * Nothing is lost when the count is reached: the oldest swimmer is waved off
 * by name (see `departed`) and kept forever in the sticker book, which holds
 * far more than any world shows.
 */
const MAX_CREATURES = 16;

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
  /* Which world Drawing School leads with, when opened from inside a world. */
  const [schoolWorld, setSchoolWorld] = useState<string | undefined>(undefined);
  /* The visit is recorded once per app start. It writes, so it must not happen
     in a render body that React may run twice. */
  const [visit] = useState<Visit>(() => markVisit());
  const [idea] = useState<string>(() => dailyIdea());
  /* Set when the child taps today's idea, so the draw screen asks for that
     instead of a random suggestion. Cleared when they leave the draw screen. */
  const [ideaPrompt, setIdeaPrompt] = useState<string | null>(null);
  const [creatures, setCreatures] = useState<Creature[]>(() => loadCreatures());
  /* Creatures made before the sticker book existed were never recorded in it —
     put them in once, so the book really does hold every drawing. */
  useEffect(() => { backfillAlbum(creatures); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);
  const [draft, setDraft] = useState<Stroke[]>([]);
  const [newId, setNewId] = useState<string | null>(null);
  /* The name of a creature the world just made room for, so the world can
     wave it off by name rather than let it vanish. It is still in the sticker
     book — this is a goodbye, not a loss. */
  const [departed, setDeparted] = useState<string | null>(null);

  /* Drawing a treat rather than a creature, and which treat the world has
     armed. A treat is a present, so nothing here counts anything down. */
  const [drawingTreat, setDrawingTreat] = useState(false);
  const [armedTreat, setArmedTreat] = useState<string | null>(null);
  /* ── the pet ──────────────────────────────────────────────────────────────
     One creature the child has crowned as theirs. Held as a pointer, so a
     creature that has been released (or was evicted by an older build) simply
     resolves to nothing rather than breaking anything.

     Nothing here decays. There is no hunger, no mood, no countdown — the pet
     is exactly as it was however long it has been, and the only thing a long
     absence changes is that its hello is warmer. */
  const [petRef, setPetRef] = useState<PetRef | null>(() => loadPet());
  const pet = useMemo(() => resolvePet(petRef, creatures), [petRef, creatures]);
  const makePet = useCallback((id: string) => setPetRef(savePet(id)), []);
  const dropPet = useCallback(() => { clearPet(); setPetRef(null); }, []);

  /* Add a creature, making room within the on-screen cap. The four ways to
     make one all funnel through here, so eviction is handled — and waved off
     by name — in exactly one place. The evicted drawing stays in the sticker
     book; this only decides who is *swimming*. */
  const addCreature = useCallback((creature: Creature) => {
    rememberInAlbum(creature);
    setCreatures((prev) => {
      const kept = makeRoom(prev, MAX_CREATURES, petRef?.id ?? null);
      const keptIds = new Set(kept.map((c) => c.id));
      const gone = prev.find((c) => !keptIds.has(c.id));
      setDeparted(gone ? gone.name : null);
      return [...kept, creature];
    });
    setNewId(creature.id);
  }, [petRef?.id]);

  /* Saying goodbye to a drawing, from wherever it is said.
     
     App owns this rather than the world scene, which used to write straight to
     storage on a timeout whenever these handlers were missing. That worked, but
     it left App's `creatures` — the very state the sketchbook shelf renders
     from — disagreeing with the disk until a reload, and raced App's own save
     effect. One owner, one path.

     The crown never dangles on somebody who has left: a released pet stops
     being the pet in the same breath. */
  const renameCreature = useCallback((id: string, name: string) => {
    setCreatures((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const renamed = { ...c, name };
      // the book knows it by name too, and `remember` updates in place rather
      // than making a second sticker of the same drawing
      rememberInAlbum(renamed);
      return renamed;
    }));
  }, []);


  const deleteCreature = useCallback((id: string) => {
    setCreatures((prev) => prev.filter((c) => c.id !== id));
    setPetRef((ref) => {
      if (!ref || ref.id !== id) return ref;
      clearPet();
      return null;
    });
  }, []);
  /* Saying goodbye from inside the book is the only thing that forgets a
     sticker. Letting a creature go from a world does *not* — the album is a
     record of what the child drew, and a drawing they said goodbye to is still
     a drawing they made. */
  const forgetSticker = useCallback((id: string) => {
    forgetFromAlbum(id);
    deleteCreature(id);
  }, [deleteCreature]);

  /* A pet whose creature is gone for good stops being remembered, so the slot
     is free next time. Runs only when it truly resolves to nothing. */
  useEffect(() => {
    if (petRef && !creatures.some((c) => c.id === petRef.id)) dropPet();
  }, [petRef, creatures, dropPet]);
  const worldIdRef = useRef(worldId);
  worldIdRef.current = worldId;

  /* `saveCreatures` reports what it managed, and that report used to be thrown
     away here — which is the worst of both worlds: the child keeps playing,
     everything looks saved, and it is gone tomorrow. Now a failure is kept so
     the grown-ups screen can say so plainly. Nothing is shown to the child:
     a four-year-old can do nothing about a full disk, and telling them their
     friends might not come back is a cruelty with no upside. */
  const [saveTrouble, setSaveTrouble] = useState<null | "creatures">(null);
  useEffect(() => {
    const r = saveCreatures(creatures);
    setSaveTrouble(!r.creatures ? "creatures" : null);
  }, [creatures]);

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

  /* A creature pinched bigger or smaller. This writes the creature's *base*
     size, which is a choice about how the child wants their world to look;
     growing up still multiplies it and is still only earned by care. */
  const resizeCreature = (id: string, scale: number) => {
    setCreatures((prev) => prev.map((c) => (c.id === id ? { ...c, scale } : c)));
  };


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
    go("reveal");
  };

  const handleConfirm = (kindId: string, name: string) => {
    const creature: Creature = {
      id: uuid(),
      kindId,
      name,
      strokes: draft,
      createdAt: Date.now(),
      wx: 0.5,
      wy: 0.5,
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: 0.03,
      phase: Math.random() * 10,
      scale: 0.75 + Math.random() * 0.45,
    };
    /* Into the book as it is *made*, not as it is evicted — so a drawing the
       child let go of by hand is remembered too. The album records what they
       drew, not what happens to still be swimming. */
    addCreature(creature);
    go("world");
  };

  /* Drawing school's payoff, and the whole reason the guide is a ghost rather
     than a stamp: what walks into the world is built from the strokes the child
     actually laid down, exactly as a freehand drawing is. The lesson taught the
     shape; it did not do the drawing. */
  const handleTraced = ({ kindId, worldId: intoWorld, strokes }: {
    kindId: string; worldId: string; strokes: Stroke[];
  }) => {
    const creature: Creature = {
      id: uuid(),
      kindId,
      name: pickName(kindId, takenNames),
      strokes,
      createdAt: Date.now(),
      wx: 0.5,
      wy: 0.5,
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: 0.03,
      phase: Math.random() * 10,
      scale: 0.8 + Math.random() * 0.35,
    };
    /* Into the book as it is *made*, not as it is evicted — so a drawing the
       child let go of by hand is remembered too. The album records what they
       drew, not what happens to still be swimming. */
    addCreature(creature);
    setSchoolWorld(undefined);
    setWorldId(intoWorld);
    go("world");
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
    };
    /* Into the book as it is *made*, not as it is evicted — so a drawing the
       child let go of by hand is remembered too. The album records what they
       drew, not what happens to still be swimming. */
    addCreature(creature);
    go("world");
  };

  /* The magic stamp: the youngest hands' way in. Tapping a stamp in the drawing
     room makes that creature at once — same doodle-bodied creature as Word
     World, so it stores tiny and stays sharp — and drops it straight into the
     world the child was drawing for. No reveal-and-guess step: the child already
     said what it is by choosing the stamp. */
  const handleStamp = (kindId: string, doodleId: string) => {
    const creature: Creature = {
      id: uuid(),
      kindId,
      name: pickName(kindId, takenNames),
      strokes: [],
      doodleId,
      createdAt: Date.now(),
      wx: 0.5,
      wy: 0.5,
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: 0.03,
      phase: Math.random() * 10,
      scale: 0.8 + Math.random() * 0.35,
    };
    /* Into the book as it is *made*, not as it is evicted — so a drawing the
       child let go of by hand is remembered too. The album records what they
       drew, not what happens to still be swimming. */
    addCreature(creature);
    setWorldId(drawWorld);
    go("world");
  };

  /* A treat the child drew. It is never run through the recogniser and never
     reaches the reveal screen — it is not alive, it is lunch. Stored as strokes
     (a few hundred bytes, re-baked at any size) and armed on the way back, so
     the very next tap on the water puts it down. */
  const handleTreatDrawn = (strokes: Stroke[]) => {
    const foods = saveFood(strokes);
    const made = foods[foods.length - 1];
    setDrawingTreat(false);
    if (made) setArmedTreat(`drawn:${made.id}`);
    go("world");
  };

  /* ── turning a page ────────────────────────────────────────────────────────
     The app is a spiral pad bound at the top, so going deeper flips the current
     sheet up over the coil and coming back drops it down again. Which of those
     it is comes from how deep a screen sits, not from a flag every caller has
     to remember to pass.

     `go` exists so the outgoing screen and the incoming one change in a single
     batch. Setting them separately would paint one frame with the new page and
     no old page, and the flip would start from a blank. */
  const DEPTH: Record<Screen, number> = {
    splash: 0, onboarding: 0, home: 1,
    world: 2, draw: 2, write: 2, school: 2, paintworld: 2, grownups: 2, album: 2,
    reveal: 3, game: 3,
  };
  const [exiting, setExiting] = useState<{ screen: Screen; back: boolean } | null>(null);
  const [back, setBack] = useState(false);
  const exitTimer = useRef<number | null>(null);

  const go = useCallback((next: Screen) => {
    setScreen((cur) => {
      if (cur === next) return cur;
      const isBack = DEPTH[next] <= DEPTH[cur];
      setBack(isBack);
      setExiting({ screen: cur, back: isBack });
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
      // a touch past the longest exit (420ms), so the sheet is never cut short
      exitTimer.current = window.setTimeout(() => setExiting(null), 470);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (exitTimer.current) window.clearTimeout(exitTimer.current); }, []);

  /* Android hardware back button. Screens navigate by state, not browser
     history, so the OS back has to be routed by hand to the same place each
     screen's own Back goes. Root screens (splash, onboarding, home) don't
     consume it, so the native shell exits the app. No-op on the web. */
  useEffect(() => {
    const onBack = (e: Event) => {
      switch (screen) {
        case "draw":
          e.preventDefault();
          if (drawingTreat) { setDrawingTreat(false); go("world"); } else go("home");
          break;
        case "reveal":
          e.preventDefault();
          go("draw");
          break;
        case "world":
          e.preventDefault();
          setNewId(null); go("home");
          break;
        case "paintworld":
          e.preventDefault();
          go(dream ? "world" : "home");
          break;
        case "school": {
          e.preventDefault();
          const from = schoolWorld;
          setSchoolWorld(undefined);
          if (from) { setWorldId(from); go("world"); } else go("home");
          break;
        }
        case "album":
        case "grownups":
        case "game":
          e.preventDefault();
          go(screen === "game" ? "world" : "home");
          break;
        // splash, onboarding, home: root — left unhandled so the shell exits
      }
    };
    window.addEventListener(BACK_EVENT, onBack);
    return () => window.removeEventListener(BACK_EVENT, onBack);
  }, [screen, go, drawingTreat, dream, schoolWorld]);

  /* One screen's worth of JSX, as a function of *which* screen — so the page
     that is leaving can go on rendering itself for the length of its flip.
     `key={screen}` alone would tear the old page out on the same frame the
     new one arrives, and an exit animation with nothing left to animate is
     just a missing transition. */
  const renderScreen = (s: Screen) => (
    <>
            {s === "splash" && (
              <Splash onStart={() => go("onboarding")} />
            )}
            {s === "onboarding" && (
              <Onboarding
                onDone={() => { markSeenIntro(); go("home"); }}
                onSkip={() => { markSeenIntro(); go("home"); }}
              />
            )}
            {s === "home" && (
              <Home
                creatures={creatures}
                onPlayWorld={(id) => {
                  if (id === "dream" && !dream) { go("paintworld"); return; }
                  setWorldId(id);
                  go("world");
                }}
                onDraw={() => { setIdeaPrompt(null); setDrawWorld("dream"); go("draw"); }}
                idea={idea}
                welcome={welcomeBack(visit)}
                onDrawIdea={() => { setIdeaPrompt(idea); setDrawWorld("dream"); go("draw"); }}
                onWrite={(id) => { setWriteWorld(id); go("write"); }}
                onDrawSchool={() => go("school")}
                onGrownUps={() => go("grownups")}
                onStickerBook={() => go("album")}
                pet={pet}
                onForget={deleteCreature}
                petLine={pet ? petGreeting(visit, pet.name) : null}
                onVisitPet={() => {
                  /* Straight to where the pet lives. A pet made before worlds
                     were tracked has no world of its own; the reef is the
                     friendliest default. */
                  setNewId(null);
                  setWorldId(worldIdRef.current || "ocean");
                  go("world");
                }}
              />
            )}
            {s === "draw" && (
              <DrawScreen
                prompt={prompt}
                worldId={drawWorld}
                onDone={handleDrawn}
                onStamp={handleStamp}
                treat={drawingTreat}
                onTreat={handleTreatDrawn}
                onBack={() => { if (drawingTreat) { setDrawingTreat(false); go("world"); } else go("home"); }}
              />
            )}
            {s === "reveal" && (
              <MagicReveal
                strokes={draft}
                result={result}
                worldId={drawWorld}
                name={pickName(result.kindId, takenNames)}
                onShuffleName={(k) => pickName(k, takenNames)}
                onConfirm={handleConfirm}
                onRedraw={() => go("draw")}
              />
            )}
            {s === "world" && (
              <WorldScene
                creatures={creatures}
                newId={newId}
                departed={departed}
                onDepartedShown={() => setDeparted(null)}
                worldId={worldId}
                dream={dream}
                onBack={() => { setNewId(null); setDeparted(null); go("home"); }}
                onDrawMore={() => { setNewId(null); setIdeaPrompt(null); setDrawWorld(worldId); go("draw"); }}
                onPlayGame={() => { setNewId(null); go("game"); }}
                onLearnDraw={() => { setNewId(null); setSchoolWorld(worldId); go("school"); }}
                onRepaint={() => go("paintworld")}
                onCare={addCare}
                onResize={resizeCreature}
                visit={visit}
                petId={petRef?.id ?? null}
                onMakePet={makePet}
                onReleasePet={dropPet}
                onRenameCreature={renameCreature}
                onDeleteCreature={deleteCreature}
                foodKind={armedTreat}
                onArmTreat={setArmedTreat}
                onDrawTreat={() => { setDrawingTreat(true); setDrawWorld(worldId); go("draw"); }}
              />
            )}
            {s === "paintworld" && (
              <PaintWorld
                initial={dream}
                onBack={() => go(dream ? "world" : "home")}
                onDone={(d) => {
                  saveDream(d);
                  setDream(d);
                  setWorldId("dream");
                  setNewId(null);
                  go("world");
                }}
              />
            )}
            {s === "write" && (
              <WriteWorld
                world={writeWorld}
                onBack={() => go("home")}
                onBorn={handleBorn}
              />
            )}
            {s === "school" && (
              <DrawSchool
                focusWorld={schoolWorld}
                onBack={() => {
                  const from = schoolWorld;
                  setSchoolWorld(undefined);
                  if (from) { setWorldId(from); go("world"); } else go("home");
                }}
                onDrawn={handleTraced}
              />
            )}
            {s === "album" && (
              <StickerBook onBack={() => go("home")} onForget={forgetSticker} />
            )}
            {s === "grownups" && (
          <GrownUps
            creatures={creatures}
            onBack={() => go("home")}
            saveTrouble={saveTrouble}
          />
        )}
        {s === "game" && (
              <MiniGame
                worldId={worldId}
                creatures={creatures}
                onBack={() => go("world")}
              />
            )}
    </>
  );

  return (
    /* The boundary sits outside everything, because a lazy screen that fails to
       download throws during render and there is nothing below it left to
       catch. `resetKey` lets a one-off crash clear itself once the app has
       moved on, rather than poisoning every screen after it. */
    <ErrorBoundary resetKey={screen}>
      <div className="page-stage h-full w-full overflow-hidden">
        {/* One boundary around the whole switch: only ever one screen is
            mounted, so a second would buy nothing. */}
        <Suspense fallback={<ScreenLoader />}>
          {exiting && (
            <div key={exiting.screen} className={`page-layer ${exiting.back ? "" : "page-flip-out"}`} aria-hidden="true">
              {renderScreen(exiting.screen)}
            </div>
          )}
          <div key={screen} className={`page-layer ${back ? "page-flip-back-in" : "page-flip-in"}`}>
            {renderScreen(screen)}
          </div>
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}
