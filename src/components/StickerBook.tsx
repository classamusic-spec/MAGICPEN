// ─── The sticker book ───────────────────────────────────────────────────────
// The world holds thirty creatures, and it always has — a framerate limit that
// a child reads as losing things. This is where they all still are.
//
// It is a book, not a manager: nothing here is a count to improve, a set to
// complete, or a gap to fill. It is the shoebox of drawings under the bed, and
// the best thing in it is watching one being drawn again.

import { useEffect, useMemo, useState } from "react";
import { loadAlbum, forget as forgetSticker, canReplay, hasArt, type AlbumEntry } from "@/lib/album";
import { kindById } from "@/lib/creatures";
import { sfxTap, sfxHappy, sfxSplash } from "@/lib/audio";
import { useBackClose } from "@/lib/native";
import { InkButton, InkCard, Scribble, Tape } from "@/components/ink/Ink";
import { Icon } from "@/components/ink/Icons";
import { Doodle } from "@/components/ink/Doodles";
import Replay from "@/components/ink/Replay";
import ReleaseConfirm from "@/components/ink/ReleaseConfirm";
import PrintSheet from "@/components/ink/PrintSheet";
import ParentGate from "@/components/ParentGate";
import { usePrefersReducedMotion } from "@/components/ink/motion";
import { hand } from "@/lib/ink";

/** When a drawing was made, said the way a small person's grown-up would. */
function whenMade(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "made today";
  if (days === 1) return "made yesterday";
  if (days < 7) return `made ${days} days ago`;
  if (days < 14) return "made last week";
  if (days < 60) return `made ${Math.floor(days / 7)} weeks ago`;
  return `made ${Math.floor(days / 30)} months ago`;
}

/** One sticker on the page: the drawing, taped down at its own angle. */
function Sticker({ e, index, onOpen }: { e: AlbumEntry; index: number; onOpen: () => void }) {
  const kind = kindById(e.kindId);
  const r = hand(index * 23 + 5);
  const tilt = (r() - 0.5) * 6;
  return (
    <button
      onClick={() => { sfxTap(); onOpen(); }}
      aria-label={`${e.name} the ${kind.label}, ${whenMade(e.createdAt)}`}
      className="ink-pinned relative block w-full"
    >
      <Tape
        seed={index + 3}
        style={{
          width: 48, height: 18, top: -7, left: "50%",
          marginLeft: -24, transform: `rotate(${(r() - 0.5) * 16}deg)`,
        }}
      />
      <InkCard seed={index * 13 + 21} radius={12} className="p-2 pt-3 text-center">
        <span className="block" style={{ transform: `rotate(${tilt}deg)` }}>
          <span className="h-16 grid place-items-center">
            {e.doodleId ? (
              <Doodle name={e.doodleId} size={54} />
            ) : canReplay(e) ? (
              // the drawing itself, sitting still until it is opened
              <Replay strokes={e.strokes} size={58} still />
            ) : (
              <Icon name="pencil" size={26} color="var(--ink-soft)" />
            )}
          </span>
          <span className="ink-title block text-fs-xs truncate mt-0.5">{e.name}</span>
        </span>
      </InkCard>
    </button>
  );
}

export default function StickerBook({
  onBack,
  onForget,
}: {
  onBack: () => void;
  /** Say goodbye for good. App removes the creature and the sticker together. */
  onForget?: (id: string) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [album, setAlbum] = useState<AlbumEntry[]>(() => loadAlbum());
  const [openId, setOpenId] = useState<string | null>(null);
  const [saying, setSaying] = useState(false);
  const [play, setPlay] = useState(0);
  /* Printing puts a drawing on paper, which is a door out of the device — so
     it asks the same grown-up question the camera and the share sheet ask. */
  const [printGate, setPrintGate] = useState(false);
  const [printing, setPrinting] = useState(false);

  // newest first: the drawing they just made is the one they want to see
  const shown = useMemo(() => [...album].reverse(), [album]);
  const open = openId ? album.find((e) => e.id === openId) ?? null : null;

  const close = () => { setOpenId(null); setSaying(false); };

  /* Android hardware back peels one layer at a time: gate → sheet → card */
  useBackClose(printGate, () => setPrintGate(false));
  useBackClose(printing, () => setPrinting(false));
  useBackClose(!!openId, close);

  /* Escape closes the card, matching the app's other dialogs — without it a
     keyboard (or switch-access) user is stuck behind the scrim. */
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const letGo = (e: AlbumEntry) => {
    sfxSplash();
    setAlbum(forgetSticker(e.id));
    onForget?.(e.id);
    close();
  };

  return (
    <div className="screen ink-paper overflow-y-auto no-scrollbar">
      <div
        className="mx-auto w-full max-w-xl pad-x pad-t"
        style={{ paddingBottom: "max(var(--sp-6), calc(var(--safe-b) + var(--sp-5)))" }}
      >
        <header className="flex items-center gap-3 anim-rise-in">
          <InkButton
            seed={11}
            radius={16}
            onClick={() => { sfxTap(); onBack(); }}
            aria-label="Back to the sketchbook"
            className="shrink-0"
            style={{ width: "var(--tap)", height: "var(--tap)" }}
          >
            <Icon name="back" size={22} />
          </InkButton>
          <div className="min-w-0 flex-1">
            <h1 className="ink-title text-fs-2xl leading-none truncate">Sticker book</h1>
            <p className="ink-hand text-fs-xs truncate">
              {album.length === 0
                ? "every drawing you make lands here"
                : `${album.length} drawing${album.length === 1 ? "" : "s"} · tap one to watch it being drawn`}
            </p>
          </div>
        </header>

        {album.length === 0 ? (
          <InkCard seed={41} radius={18} className="mt-6 p-6 text-center" contentClassName="grid gap-2 justify-items-center">
            <Icon name="pencil" size={34} color="var(--ink-soft)" />
            <span className="ink-title text-fs-lg">Nothing in the book yet</span>
            <span className="ink-hand text-fs-sm">Draw something and it will be here forever.</span>
          </InkCard>
        ) : (
          <div
            className="mt-6 grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}
          >
            {shown.map((e, i) => (
              <Sticker key={e.id} e={e} index={i} onOpen={() => { setOpenId(e.id); setPlay((n) => n + 1); }} />
            ))}
          </div>
        )}
      </div>

      {/* ── one drawing, up close, drawing itself again ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4 overflow-y-auto"
          style={{ background: "rgba(45,41,38,0.5)" }}
          role="dialog"
          aria-modal="true"
          aria-label={`${open.name}`}
          onClick={close}
        >
          <InkCard
            seed={73}
            radius={22}
            className={`w-full max-w-sm m-auto p-5 ${reduced ? "" : "anim-pop-in"}`}
            contentClassName="grid gap-1 justify-items-center text-center"
            onClick={(ev) => ev.stopPropagation()}
          >
            <span className="grid place-items-center" style={{ minHeight: 200 }}>
              {canReplay(open) ? (
                <Replay strokes={open.strokes} size={200} playKey={play} />
              ) : hasArt(open) ? (
                <Doodle name={open.doodleId!} size={150} />
              ) : (
                <span className="ink-hand text-fs-sm">This one was a photograph.</span>
              )}
            </span>

            <h2 className="ink-title text-fs-2xl leading-tight">{open.name}</h2>
            <p className="ink-hand text-fs-xs">
              your {kindById(open.kindId).label} · {whenMade(open.createdAt)}
            </p>
            <span className="block w-20 mt-1"><Scribble seed={19} height={8} /></span>

            {!saying ? (
              <div className="grid gap-2 w-full mt-3">
                {canReplay(open) && (
                  <InkButton
                    seed={57}
                    radius={16}
                    tone="#8b46c7"
                    onClick={() => { sfxHappy(); setPlay((n) => n + 1); }}
                    aria-label={`Watch ${open.name} being drawn again`}
                    style={{ minHeight: "var(--tap-lg)" }}
                  >
                    <Icon name="sparkle" size={20} color="var(--sun)" fill="var(--sun)" />
                    <span className="ink-on-wax ink-title text-fs-md">Watch it again</span>
                  </InkButton>
                )}
                {hasArt(open) && (
                  <InkButton
                    seed={39}
                    radius={16}
                    onClick={() => { sfxTap(); setPrintGate(true); }}
                    aria-label={`Print ${open.name} for the fridge`}
                    style={{ minHeight: "var(--tap)" }}
                  >
                    <Icon name="print" size={19} />
                    <span className="ink-title text-fs-md">Print it</span>
                  </InkButton>
                )}
                <InkButton
                  seed={23}
                  radius={16}
                  autoFocus
                  onClick={() => { sfxTap(); close(); }}
                  style={{ minHeight: "var(--tap)" }}
                >
                  <span className="ink-title text-fs-md">Close</span>
                </InkButton>
                {onForget && (
                  <button
                    onClick={() => { sfxTap(); setSaying(true); }}
                    className="hud-focus h-11 flex items-center justify-center gap-2"
                    style={{ color: "var(--coral)" }}
                  >
                    <Icon name="globe" size={17} color="var(--coral)" weight={2.1} />
                    <span className="font-display font-bold underline underline-offset-4" style={{ fontSize: "var(--fs-sm)" }}>
                      Let {open.name} go…
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <ReleaseConfirm
                name={open.name}
                onKeep={() => { sfxTap(); setSaying(false); }}
                onRelease={() => letGo(open)}
              />
            )}
          </InkCard>
        </div>
      )}

      {printGate && open && (
        <ParentGate
          title={`Print ${open.name}?`}
          onPass={() => { setPrintGate(false); setPrinting(true); }}
          onCancel={() => setPrintGate(false)}
        />
      )}
      {printing && open && (
        <PrintSheet
          name={open.name}
          subtitle={`your ${kindById(open.kindId).label} · ${whenMade(open.createdAt)}`}
          strokes={open.strokes}
          doodleId={open.doodleId}
          onClose={() => setPrinting(false)}
        />
      )}
    </div>
  );
}
