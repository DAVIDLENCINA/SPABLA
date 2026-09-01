/**
 * SPABLA · UX-02 · Productive chat visual tokens.
 *
 * Promoted from the approved UX-01-R2 visual language.
 * Productive code MUST NOT depend on app/v2/design/**.
 */

export const chatColor = {
  surface: "#FFFFFF",
  surfaceAlt: "#FBFCFE",
  surfaceSubtle: "#F1F5F9",
  surfaceElevated: "#FFFFFF",

  textPrimary: "#0B0F19",
  textSecondary: "#475569",
  textMuted: "#64748B",
  textInverse: "#FFFFFF",

  border: "#E5EAF0",
  borderStrong: "#CBD5E1",

  spablaCyan: "#1EC7FF",
  spablaCyanSoft: "#E6F7FF",
  spablaCoral: "#FF6B7A",
  spablaCoralSoft: "#FFF1F2",
  spablaNavy: "#0B0F19",

  presence: "#22C55E",
  danger: "#EF4444",
  warning: "#F59E0B",

  bubbleSelfBg: "#1EC7FF",
  bubbleSelfText: "#0B0F19",
  bubbleOtherBg: "#F1F5F9",
  bubbleOtherText: "#0B0F19",
} as const;

export const chatRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  bubble: 18,
  pill: 999,
} as const;

export const chatSpace = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const chatFont = {
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
