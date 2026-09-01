import type { CSSProperties } from "react";
import { color, font, radius, space } from "../styles/tokens";
import { IconEmoji, IconMic, IconPaperclip } from "./Icons";

type Props = { readonly compact?: boolean };

export function Composer({ compact }: Props = {}): React.JSX.Element {
  const wrap: CSSProperties = {
    padding: compact ? `${space.sm}px ${space.md}px` : `${space.sm}px ${space.xl}px`,
    background: color.surface,
    borderTop: `1px solid ${color.border}`,
    flexShrink: 0,
  };
  const box: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: `6px 10px`,
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: radius.pill,
  };
  const iconBtn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "none",
    background: "transparent",
    color: color.textSecondary,
    cursor: "pointer",
    flexShrink: 0,
  };
  return (
    <div style={wrap} data-role="composer">
      <div style={box} role="group" aria-label="Redactar mensaje">
        <button type="button" style={iconBtn} aria-label="Adjuntar archivo">
          <IconPaperclip size={17} />
        </button>
        <input
          type="text"
          placeholder="Escribe un mensaje…"
          aria-label="Mensaje"
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            padding: `6px 4px`,
            fontFamily: font.family,
            fontSize: font.size.sm,
            color: color.textPrimary,
            background: "transparent",
          }}
        />
        <button type="button" style={iconBtn} aria-label="Insertar emoji">
          <IconEmoji size={17} />
        </button>
        <button
          type="button"
          aria-label="Enviar mensaje de voz"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "none",
            background: color.spablaCyan,
            color: color.spablaNavy,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <IconMic size={17} color={color.spablaNavy} />
        </button>
      </div>
    </div>
  );
}
