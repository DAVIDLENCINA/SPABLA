/**
 * SPABLA · UX-01 · Design tokens for the visual prototype.
 *
 * These tokens are ONLY used by `app/v2/design/**`. They must NOT be
 * imported from productive code paths (`app/v2/chat/**` and the rest
 * of the app). If the design study is ever promoted, tokens migrate
 * into the productive palette module — not the other way around.
 *
 * Values chosen to match the three UX-01 reference images while
 * respecting the identity constraints in the order:
 *   · white surfaces dominant
 *   · SPABLA cyan for accents and self-messages
 *   · SPABLA coral used sparingly for the "other person" surface in
 *     Modo Traductor and the destructive end-call button
 *   · deep navy for primary text
 *   · muted greys for dividers / metadata
 *   · green ONLY for presence
 *   · red ONLY for finalising a call
 */

/**
 * Official brand palette (UX-01-R):
 *   · Cyan  #1EC7FF   — brand accent, self-message surface, selection
 *   · Coral #FF6B7A   — brand accent, "other person" translator zone
 *   · White #FFFFFF   — dominant surface, deep-navy chip for the logo
 *   · Navy  #0B0F19   — primary text and functional dark actions
 *
 * Accessibility: cyan + white text is 1.85:1 (fail). We pair cyan
 * with navy text (12.13:1) so self bubbles stay brand-forward and
 * WCAG AAA. Navy remains available for send buttons, primary
 * actions and hover states that need dark surfaces.
 */
export const color = {
  // Surfaces
  surface: "#FFFFFF",
  surfaceAlt: "#FBFCFE",
  surfaceSubtle: "#F1F5F9",
  surfaceElevated: "#FFFFFF",

  // Text
  textPrimary: "#0B0F19",
  textSecondary: "#475569",
  textMuted: "#64748B",
  textInverse: "#FFFFFF",

  // Borders / dividers
  border: "#E5EAF0",
  borderStrong: "#CBD5E1",

  // Brand (official)
  spablaCyan: "#1EC7FF",
  spablaCyanSoft: "#E6F7FF",
  spablaCoral: "#FF6B7A",
  spablaCoralSoft: "#FFF1F2",
  spablaNavy: "#0B0F19",

  // Semantics
  presence: "#22C55E",
  danger: "#EF4444",
  warning: "#F59E0B",

  // Message bubbles
  //   self  · cyan bg with navy ink for AAA legibility
  //   peer  · light surface with navy ink
  bubbleSelfBg: "#1EC7FF",
  bubbleSelfText: "#0B0F19",
  bubbleOtherBg: "#F1F5F9",
  bubbleOtherText: "#0B0F19",

  // Translator mode zones
  zoneSelfBg: "#E6F7FF",
  zoneSelfAccent: "#0B9DD3",
  zoneOtherBg: "#FFF1F2",
  zoneOtherAccent: "#DA4A5B",
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  bubble: 18,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const font = {
  family:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  jp: "'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', system-ui, sans-serif",
  size: {
    xs: "0.75rem",
    sm: "0.85rem",
    base: "0.95rem",
    lg: "1.05rem",
    xl: "1.35rem",
    display: "1.8rem",
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export const shadow = {
  card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
  overlay:
    "0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.06)",
} as const;
