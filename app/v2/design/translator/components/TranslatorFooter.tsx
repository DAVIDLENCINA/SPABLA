import Link from "next/link";
import type { CSSProperties } from "react";
import { color, font, radius, space } from "../../chat/styles/tokens";
import { IconBookmark, IconRepeat, IconStop, IconText } from "../../chat/components/Icons";

type Props = { readonly compact?: boolean };

/**
 * Single-row action bar. In compact mobile, labels shrink to their
 * shortest sensible form and Finalizar keeps its dedicated red pill
 * on the same row so it never gets isolated on a second line.
 */
export function TranslatorFooter({ compact }: Props): React.JSX.Element {
  const wrap: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: compact ? 4 : space.md,
    padding: compact ? `6px ${space.sm}px` : `${space.md}px ${space.xl}px`,
    background: color.surface,
    borderTop: `1px solid ${color.border}`,
    flexShrink: 0,
  };
  const btn = (label: string, shortLabel: string, icon: React.ReactNode): React.JSX.Element => (
    <button type="button" aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: compact ? "5px 6px" : "8px 12px",
        borderRadius: 10,
        border: "none",
        background: "transparent",
        color: color.textSecondary,
        cursor: "pointer",
        fontFamily: font.family,
        fontSize: compact ? 11 : font.size.sm,
        fontWeight: font.weight.semibold,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}>
      {icon}
      <span>{shortLabel}</span>
    </button>
  );
  return (
    <footer style={wrap}>
      <div style={{ display: "flex", gap: compact ? 2 : 4, alignItems: "center", flex: "1 1 auto", minWidth: 0, overflow: "hidden" }}>
        {btn("Repetir última frase", compact ? "Repetir" : "Repetir última", <IconRepeat size={compact ? 14 : 16} />)}
        {btn("Mostrar texto completo", compact ? "Texto" : "Mostrar texto", <IconText size={compact ? 14 : 16} />)}
        {btn("Guardar conversación", compact ? "Guardar" : "Guardar conversación", <IconBookmark size={compact ? 14 : 16} />)}
      </div>
      <Link href="/v2/design/chat" prefetch={false} aria-label="Finalizar Modo Traductor"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: compact ? "6px 10px" : "8px 14px",
          borderRadius: radius.pill,
          background: color.danger,
          color: "#FFFFFF",
          textDecoration: "none",
          fontFamily: font.family,
          fontSize: compact ? 11 : font.size.sm,
          fontWeight: font.weight.bold,
          flexShrink: 0,
        }}>
        <IconStop size={compact ? 12 : 14} color="#FFFFFF" />
        Finalizar
      </Link>
    </footer>
  );
}
