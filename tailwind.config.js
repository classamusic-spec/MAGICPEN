/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  /* Custom component classes live in @layer components, which Tailwind
     tree-shakes against `content`. Safelisting guarantees they survive even if
     a class is only ever referenced from another stylesheet rule. */
  safelist: [
    "paper-grain", "paper-sheet", "sticker-card", "card-plain", "card-dashed", "blob", "blob-2",
    "chip", "chip-sun", "chip-coral", "chip-teal",
    "grad-magic", "grad-sea", "grad-go", "grad-sun", "grad-berry",
    "sticker-btn", "tap", "tap-lg", "btn-icon", "btn-icon-lg", "btn-pill", "btn-hero",
    "swatch", "is-on",
    "type-hero", "type-title", "type-h2", "type-h3", "type-body", "type-label", "type-fine",
    "ink-outline", "visually-hidden",
    "screen", "pad-t", "pad-b", "pad-x", "shelf",
    "stage-grid", "stage-top", "stage-canvas", "stage-tools", "stage-go",
    "reveal-grid", "reveal-head", "reveal-stage", "reveal-panel",
    "toolbar", "crayon-rail", "tool-cluster", "land-hide",
    "topbar", "topbar-nav", "topbar-actions", "topbar-prompt",
    "canvas-touch", "no-scrollbar",
  ],
  theme: {
    extend: {
      /* Viewport shapes we actually design for. `raw` queries so they compose
         with orientation, not just width: a 640x360 phone in landscape is a
         different layout problem from a 1024x1366 tablet. */
      screens: {
        short: { raw: "(max-height: 560px)" },
        tall: { raw: "(min-height: 720px)" },
        land: { raw: "(orientation: landscape)" },
        landshort: { raw: "(orientation: landscape) and (max-height: 560px)" },
        motionsafe: { raw: "(prefers-reduced-motion: no-preference)" },
      },
      fontFamily: {
        display: ['"Baloo 2"', '"Nunito"', "ui-rounded", "system-ui", "sans-serif"],
        body: ['"Nunito"', "ui-rounded", "system-ui", "sans-serif"],
      },
      /* the fluid type scale from index.css, reachable as text-fs-lg etc. */
      fontSize: {
        "fs-2xs": "var(--fs-2xs)",
        "fs-xs": "var(--fs-xs)",
        "fs-sm": "var(--fs-sm)",
        "fs-md": "var(--fs-md)",
        "fs-lg": "var(--fs-lg)",
        "fs-xl": "var(--fs-xl)",
        "fs-2xl": "var(--fs-2xl)",
        "fs-3xl": "var(--fs-3xl)",
        "fs-4xl": "var(--fs-4xl)",
      },
      spacing: {
        tap: "var(--tap)",
        "tap-lg": "var(--tap-lg)",
        "tap-hero": "var(--tap-hero)",
        gutter: "var(--gutter)",
      },
      colors: {
        /* MAGIC PEN brand — deliberately namespaced so it never shadows a
           default Tailwind ramp (sky/teal/pink) that other screens rely on. */
        ink: { DEFAULT: "var(--ink)", soft: "var(--ink-soft)" },
        paper: { DEFAULT: "var(--paper)", deep: "var(--paper-deep)", card: "var(--paper-card)" },
        plum: "var(--plum)",
        coral: "var(--coral)",
        sunny: "var(--sun)",
        lagoon: "var(--teal)",
        candy: "var(--pink)",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        pen: "var(--r-md)",
        "pen-lg": "var(--r-lg)",
        "pen-xl": "var(--r-xl)",
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "ink-1": "var(--el-1)",
        "ink-2": "var(--el-2)",
        "ink-3": "var(--el-3)",
        soft: "var(--soft-2)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}