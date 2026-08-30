import type { CSSProperties } from "react";
import { color, font, radius, space } from "../styles/tokens";
import type { CallEvent } from "../fixtures/timeline";
import { IconPhone, IconPlay, IconVideo } from "./Icons";

type Props = { readonly event: CallEvent; readonly compact?: boolean };

/**
 * Timeline card for a completed voice/video call. Compact mobile
 * layout uses two rows so the title, meta and action fit without
 * torpid word-breaks.
 */
export function CallEventCard({ event, compact }: Props): React.JSX.Element {
  const isVoice = event.kind === "call-voice";
  const label = isVoice ? "Llamada de voz" : "Videollamada";
  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: compact ? space.sm : space.md,
    padding: compact ? `8px 10px` : `${space.md}px ${space.lg}px`,
    borderRadius: radius.md,
    border: `1px solid ${color.border}`,
    background: color.surface,
    margin: `${space.sm}px auto`,
    maxWidth: 620,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  };
  const iconWrap: CSSProperties = {
    width: compact ? 34 : 40,
    height: compact ? 34 : 40,
    borderRadius: "50%",
    background: isVoice ? color.spablaCyanSoft : "#ECFDF5",
    color: isVoice ? color.spablaNavy : "#059669",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
  const meta: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.3,
    minWidth: 0,
    flex: 1,
  };
  const titleStyle: CSSProperties = {
    fontFamily: font.family,
    fontWeight: font.weight.semibold,
    color: color.textPrimary,
    fontSize: compact ? font.size.sm : font.size.base,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const metaStyle: CSSProperties = {
    fontFamily: font.family,
    fontSize: font.size.xs,
    color: color.textMuted,
    marginTop: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const teaser: CSSProperties = {
    fontFamily: font.family,
    fontSize: font.size.xs,
    color: color.textSecondary,
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
  return (
    <article style={style} aria-label={`${label} finalizada`}>
      <span style={iconWrap}>
        {isVoice ? <IconPhone size={compact ? 15 : 18} /> : <IconVideo size={compact ? 15 : 18} />}
      </span>
      <div style={meta}>
        <span style={titleStyle}>{label}</span>
        <span style={metaStyle}>{event.durationLabel} · {event.time}</span>
        {!compact ? <span style={teaser}>{event.transcriptTeaser}</span> : null}
      </div>
      <button
        type="button"
        aria-label={`Ver transcripción de ${label.toLowerCase()}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: compact ? "5px 10px" : "8px 12px",
          borderRadius: radius.pill,
          border: `1px solid ${color.border}`,
          background: color.surface,
          color: color.textPrimary,
          fontFamily: font.family,
          fontSize: compact ? 12 : font.size.sm,
          fontWeight: font.weight.semibold,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <IconPlay size={12} color={color.spablaNavy} />
        {compact ? "Transcripción" : "Ver transcripción"}
      </button>
    </article>
  );
}
