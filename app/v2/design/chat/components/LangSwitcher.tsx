import type { CSSProperties } from "react";
import { color, font, radius } from "../styles/tokens";
import { IconChevronDown, IconSwap } from "./Icons";

type Props = {
  readonly self: string;
  readonly other: string;
  readonly selfCode: string;
  readonly otherCode: string;
  readonly compact?: boolean;
};

/**
 * Language pair selector. No flags — flags carry political and
 * cultural connotations and are unreliable authority for language
 * identity. ISO-like short code + full name only.
 */
export function LangSwitcher({ self, other, selfCode, otherCode, compact }: Props): React.JSX.Element {
  const wrapperStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: compact ? "3px 8px" : "5px 10px",
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: radius.pill,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
    fontFamily: font.family,
    fontSize: compact ? font.size.xs : font.size.sm,
    color: color.textPrimary,
  };
  const chipStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: compact ? "2px 8px" : "3px 10px",
    borderRadius: radius.pill,
    background: color.surfaceSubtle,
  };
  const codeStyle: CSSProperties = {
    fontWeight: font.weight.bold,
    color: color.spablaNavy,
    fontSize: compact ? 11 : font.size.xs,
    letterSpacing: "0.05em",
  };
  const nameStyle: CSSProperties = { color: color.textPrimary, fontWeight: font.weight.medium };
  const btnSize = compact ? 22 : 24;
  return (
    <div style={wrapperStyle} role="group" aria-label="Par de idiomas de traducción">
      <span style={chipStyle}>
        <span style={codeStyle}>{selfCode.toUpperCase()}</span>
        <span style={nameStyle}>{self}</span>
      </span>
      <button
        type="button"
        aria-label="Intercambiar idiomas"
        style={{
          border: `1px solid ${color.border}`,
          background: color.surface,
          borderRadius: "50%",
          width: btnSize,
          height: btnSize,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
          color: color.textSecondary,
        }}
      >
        <IconSwap size={12} />
      </button>
      <span style={chipStyle}>
        <span style={codeStyle}>{otherCode.toUpperCase()}</span>
        <span style={nameStyle}>{other}</span>
      </span>
      <button
        type="button"
        aria-label="Cambiar par de idiomas"
        style={{
          border: "none",
          background: "transparent",
          padding: "0 2px",
          cursor: "pointer",
          color: color.textSecondary,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <IconChevronDown size={14} />
      </button>
    </div>
  );
}
