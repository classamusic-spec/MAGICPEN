// ─── Drawn icons ────────────────────────────────────────────────────────────
// Emoji render differently on every platform and read as "we didn't make art".
// These are drawn on a 24×24 grid with a wobbling hand and round caps, so they
// sit in the same world as the child's crayon.

export type IconName =
  | "home" | "back" | "undo" | "redo" | "camera" | "eraser"
  | "soundOn" | "soundOff" | "play" | "pause" | "close" | "check"
  | "pencil" | "sparkle" | "globe" | "gamepad" | "share" | "plus"
  | "heart" | "heartEmpty" | "star" | "starEmpty" | "trophy" | "lock"
  | "dice" | "clock" | "more" | "trash" | "print";

/* Paths are authored slightly off-true on purpose: a perfectly symmetrical
   icon next to a wobbling button reads as a foreign object. */
const PATHS: Record<IconName, string> = {
  home: "M3.4 11.2 12 3.9l8.7 7.1M5.6 9.7v10.1h12.9V9.6M9.7 19.7v-5.6h4.7v5.7",
  back: "M19.4 12.1H4.6M10.4 5.4 4.3 12.1l6.2 6.4",
  undo: "M8.6 5.7 4.2 9.9l4.6 4M4.5 9.9h9.2c3.5 0 5.9 2.1 5.9 5.1s-2.5 5-6 5h-4.2",
  redo: "M15.5 5.7l4.4 4.2-4.6 4M19.6 9.9h-9.2c-3.5 0-5.9 2.1-5.9 5.1s2.5 5 6 5h4.2",
  camera: "M3.3 8.6h3.9l1.7-2.6h6.3l1.7 2.6h3.8v10.9H3.2zM12 17.1a3.6 3.6 0 1 0-.1-7.2 3.6 3.6 0 0 0 .1 7.2z",
  eraser: "M8.8 20.1h11M5 15.4 13.6 6.7c.8-.8 2-.8 2.8 0l3 3c.8.8.8 2 0 2.8l-7.6 7.6H7.7L5 17.4a1.4 1.4 0 0 1 0-2zM10.1 10.3l5.7 5.8",
  soundOn: "M4.4 9.4h3.3l4.4-3.9v13.2l-4.5-3.9H4.3zM15.6 9.2c1.5 1.5 1.5 4.1 0 5.7M18.4 6.5c3 3 3 8.1 0 11.1",
  soundOff: "M4.4 9.4h3.3l4.4-3.9v13.2l-4.5-3.9H4.3zM16.1 9.7l5.3 5.3M21.4 9.7l-5.3 5.3",
  play: "M7.4 4.9 19.3 12 7.3 19.2z",
  pause: "M8.6 5.1v13.9M15.5 5.2v13.8",
  close: "M5.6 5.4l12.9 13.2M18.6 5.5 5.5 18.5",
  check: "M4.6 12.6 9.7 18 19.4 6.2",
  pencil: "M4.2 19.9l1-4.4L15.4 5.2c.8-.8 2.1-.8 2.9 0l1.2 1.2c.8.8.8 2.1 0 2.9L9.2 19.4zM13.6 7.1l3.9 3.9",
  sparkle: "M12 3.2c.6 4.4 1.9 5.8 6.3 6.4-4.4.7-5.7 2-6.3 6.4-.6-4.4-1.9-5.7-6.3-6.4 4.4-.6 5.7-2 6.3-6.4zM18.4 15.1c.3 2.1.9 2.7 3 3-2.1.4-2.7 1-3 3.1-.3-2.1-.9-2.7-3-3.1 2.1-.3 2.7-.9 3-3z",
  globe: "M12 3.3a8.7 8.7 0 1 0 .2 17.4A8.7 8.7 0 0 0 12 3.3zM3.4 12h17.2M12 3.3c4.6 5 4.6 12.4 0 17.4M12 3.3c-4.6 5-4.6 12.4 0 17.4",
  gamepad: "M8.2 7.6h7.7c3 0 5.2 2.6 5.2 5.9s-1.8 4.9-4 4.9c-1.6 0-2.4-1-3.4-2H10c-1 1-1.8 2-3.4 2-2.2 0-4-1.7-4-4.9s2.2-5.9 5.2-5.9zM6.1 11.3v3.4M4.4 13h3.4M15.6 12.2h.1M18 14.4h.1",
  share: "M12 15.6V3.7M8.1 7.4 12 3.6l4 3.9M4.9 12.9v6.4c0 .6.5 1.1 1.1 1.1h12c.6 0 1.1-.5 1.1-1.1v-6.5",
  plus: "M12 4.6v14.9M4.6 12.1h14.8",
  heart: "M12 20.2S3.4 15.1 3.4 9.2c0-2.7 2.1-4.8 4.7-4.8 1.9 0 3.2 1.1 3.9 2.3.7-1.2 2-2.3 3.9-2.3 2.6 0 4.7 2.1 4.7 4.8 0 5.9-8.6 11-8.6 11z",
  heartEmpty: "M12 20.2S3.4 15.1 3.4 9.2c0-2.7 2.1-4.8 4.7-4.8 1.9 0 3.2 1.1 3.9 2.3.7-1.2 2-2.3 3.9-2.3 2.6 0 4.7 2.1 4.7 4.8 0 5.9-8.6 11-8.6 11z",
  star: "M12 3.6l2.7 5.6 6.1.9-4.5 4.3 1.1 6.1-5.4-2.9-5.5 2.8 1.1-6.1L3 10.2l6.2-.9z",
  starEmpty: "M12 3.6l2.7 5.6 6.1.9-4.5 4.3 1.1 6.1-5.4-2.9-5.5 2.8 1.1-6.1L3 10.2l6.2-.9z",
  trophy: "M7.3 4.3h9.5v5.1c0 2.7-2.1 4.8-4.7 4.8s-4.8-2.1-4.8-4.8zM7.2 5.8H4.5c0 2.9 1.2 4.4 2.9 4.7M16.8 5.8h2.7c0 2.9-1.2 4.4-2.9 4.7M12 14.3v3.5M8.4 20.1h7.3l-.9-2.3H9.2z",
  lock: "M6.4 10.6h11.3v9.2H6.3zM8.6 10.5V7.9a3.4 3.4 0 0 1 6.8 0v2.6M12 14.1v2.6",
  dice: "M5.2 5.3h13.6v13.5H5.1zM9.1 9.2h.1M15 9.3h.1M12 12.1h.1M9.1 15h.1M15 15.1h.1",
  clock: "M12 3.4a8.6 8.6 0 1 0 .2 17.2A8.6 8.6 0 0 0 12 3.4zM12 7.2v5.1l3.4 2.1",
  more: "M6.2 12.1h.1M12 12.1h.1M17.8 12.1h.1",
  trash: "M4.8 6.9h14.5M9.6 6.8V4.6h4.9v2.2M6.7 6.9l.9 12.9h8.9l.9-12.9M10.2 10.3v6.1M13.9 10.4v6",
  print: "M6.6 9.2V4.8h10.9v4.4M4.6 9.3h14.9v7.1h-3M7.5 16.4h-3V9.4M7.6 13.9h8.9v6H7.5zM9.9 16.6h4.3M17 11.6h.1",
};

/** Icons whose path should be filled as well as stroked. */
const FILLED: Partial<Record<IconName, boolean>> = {
  play: true, heart: true, star: true, sparkle: true,
};

export interface IconProps {
  name: IconName;
  size?: number;
  /** Stroke colour. Defaults to the app's ink. */
  color?: string;
  /** Fill colour for solid icons (heart, star, play). */
  fill?: string;
  weight?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({
  name, size = 24, color = "var(--ink)", fill, weight = 2.1, className = "", style,
}: IconProps) {
  const solid = FILLED[name];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ display: "block", overflow: "visible", ...style }}
    >
      <path
        d={PATHS[name]}
        fill={solid ? (fill ?? color) : "none"}
        stroke={color}
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
