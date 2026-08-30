import Link from "next/link";
import type { CSSProperties } from "react";
import Image from "next/image";
import { color, font, space } from "../../chat/styles/tokens";
import { IconArrowLeft, IconSettings } from "../../chat/components/Icons";

type Props = { readonly compact?: boolean };

export function TranslatorHeader({ compact }: Props): React.JSX.Element {
  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: compact ? `${space.sm}px ${space.md}px` : `${space.md}px ${space.xl}px`,
    background: color.surface,
    borderBottom: `1px solid ${color.border}`,
    minHeight: compact ? 52 : 60,
    flexShrink: 0,
  };
  const centre: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    lineHeight: 1.3,
    flex: "1 1 auto",
    minWidth: 0,
    textAlign: "center",
  };
  const btnStyle: CSSProperties = {
    width: compact ? 32 : 36,
    height: compact ? 32 : 36,
    borderRadius: 10,
    border: `1px solid ${color.border}`,
    background: color.surface,
    color: color.textSecondary,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    flexShrink: 0,
  };
  return (
    <header style={style} role="banner">
      <div style={{ display: "flex", alignItems: "center", gap: space.sm, flexShrink: 0 }}>
        <Link href="/v2/design/chat" aria-label="Volver al chat" prefetch={false} style={btnStyle}>
          <IconArrowLeft size={compact ? 15 : 18} />
        </Link>
        {!compact ? (
          <Image src="/design/spabla-logo-horizontal-provisional.png" alt="SPABLA" width={112} height={37} priority style={{ height: 26, width: "auto" }} />
        ) : null}
      </div>
      <div style={centre}>
        <span style={{
          fontFamily: font.family,
          fontSize: compact ? font.size.base : font.size.lg,
          fontWeight: font.weight.semibold,
          color: color.textPrimary,
        }}>
          Modo Traductor
        </span>
        <span style={{
          fontFamily: font.family,
          fontSize: font.size.xs,
          color: color.presence,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color.presence, display: "inline-block" }} />
          Traducción en tiempo real
        </span>
      </div>
      <button type="button" aria-label="Ajustes del traductor" style={btnStyle}>
        <IconSettings size={compact ? 15 : 18} />
      </button>
    </header>
  );
}
