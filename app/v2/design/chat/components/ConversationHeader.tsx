import Link from "next/link";
import type { CSSProperties } from "react";
import { color, font, space } from "../styles/tokens";
import { TAKASHI } from "../fixtures/identities";
import type { CallMode } from "../state";
import { Avatar } from "./Avatar";
import { IconArrowLeft, IconMore, IconPhone, IconVideo } from "./Icons";

type Props = {
  readonly call: CallMode;
  readonly compact?: boolean;
};

/**
 * Header of the active conversation with Takashi. Voice and video
 * buttons DO NOT navigate away — they mutate the `call` search
 * param on the same page, keeping the timeline in scope. `compact`
 * shrinks avatar / buttons / padding for the mobile viewport.
 */
export function ConversationHeader({ call, compact }: Props): React.JSX.Element {
  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: compact ? `${space.sm}px ${space.md}px` : `10px ${space.xl}px`,
    background: color.surface,
    borderBottom: `1px solid ${color.border}`,
    minHeight: compact ? 52 : 60,
    gap: space.sm,
  };
  const avatarSize = compact ? 34 : 40;
  const btnSize = compact ? 34 : 38;
  const iconSize = compact ? 16 : 18;

  const iconBtn = (label: string, href: string, active: boolean, icon: React.ReactNode): React.JSX.Element => (
    <Link
      href={href}
      aria-label={label}
      aria-pressed={active}
      prefetch={false}
      style={{
        width: btnSize,
        height: btnSize,
        borderRadius: 10,
        border: `1px solid ${active ? color.spablaNavy : color.border}`,
        background: active ? color.spablaNavy : color.surface,
        color: active ? color.textInverse : color.textSecondary,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        transition: "background-color 120ms ease",
      }}
    >
      {icon}
    </Link>
  );
  const iconColor = (active: boolean): string => (active ? "#FFFFFF" : color.textSecondary);
  return (
    <header style={style} data-role="conversation-header">
      <div style={{ display: "flex", alignItems: "center", gap: space.sm, minWidth: 0, flex: "1 1 auto" }}>
        <Link href="?" aria-label="Volver" prefetch={false}
              style={{
                width: btnSize, height: btnSize, borderRadius: 10, border: `1px solid ${color.border}`,
                background: color.surface, color: color.textSecondary,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                textDecoration: "none", flexShrink: 0,
              }}>
          <IconArrowLeft size={iconSize} />
        </Link>
        <Avatar src={TAKASHI.avatarDataUri} name={TAKASHI.displayName} size={avatarSize} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
          <span style={{
            fontFamily: font.family,
            fontSize: compact ? font.size.base : font.size.lg,
            fontWeight: font.weight.semibold,
            color: color.textPrimary,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {TAKASHI.displayName}
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
            En línea
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
        {iconBtn("Iniciar llamada de voz", "?call=voice", call === "voice",
                 <IconPhone size={iconSize} color={iconColor(call === "voice")} />)}
        {iconBtn("Iniciar videollamada", "?call=video",
                 call === "video" || call === "video-min",
                 <IconVideo size={iconSize} color={iconColor(call === "video" || call === "video-min")} />)}
        <button type="button" aria-label="Más acciones"
                style={{
                  width: btnSize, height: btnSize, borderRadius: 10, border: `1px solid ${color.border}`,
                  background: color.surface, color: color.textSecondary, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
          <IconMore size={iconSize} />
        </button>
      </div>
    </header>
  );
}
