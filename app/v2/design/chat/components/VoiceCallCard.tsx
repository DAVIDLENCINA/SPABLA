import Link from "next/link";
import type { CSSProperties } from "react";
import { color, font, radius, space } from "../styles/tokens";
import { LAURA, TAKASHI } from "../fixtures/identities";
import { LIVE_TRANSCRIPT } from "../fixtures/timeline";
import { Avatar } from "./Avatar";
import { IconCaptions, IconEndCall, IconMic, IconSpeaker } from "./Icons";

type Props = { readonly compact?: boolean };

/**
 * In-conversation voice call surface. Sits between the timeline
 * and the composer — the header, sidebar and message log stay
 * visible so the call feels like an event inside the same
 * conversation. `compact` reduces the transcript preview and
 * padding for the mobile viewport.
 */
export function VoiceCallCard({ compact }: Props = {}): React.JSX.Element {
  const wrap: CSSProperties = {
    margin: compact ? `${space.sm}px ${space.md}px 0` : `${space.sm}px ${space.xl}px 0`,
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: radius.lg,
    padding: compact ? space.md : space.lg,
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.05)",
    display: "flex",
    flexDirection: "column",
    gap: compact ? space.sm : space.md,
    flexShrink: 0,
  };
  const identityRow: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  };
  const statusPill: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 9px",
    borderRadius: radius.pill,
    background: "#ECFDF5",
    color: "#059669",
    fontFamily: font.family,
    fontSize: 11,
    fontWeight: font.weight.semibold,
    whiteSpace: "nowrap",
  };
  // Take at most 2 lines in compact to keep the timeline visible.
  const shown = compact ? LIVE_TRANSCRIPT.slice(-2) : LIVE_TRANSCRIPT;
  return (
    <section
      style={wrap}
      role="region"
      aria-label="Llamada de voz activa con Takashi Mori"
      aria-live="polite"
    >
      <div style={identityRow}>
        <div style={{ display: "flex", alignItems: "center", gap: space.sm, minWidth: 0 }}>
          <Avatar src={TAKASHI.avatarDataUri} name={TAKASHI.displayName} size={compact ? 34 : 42} online />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, minWidth: 0 }}>
            <span style={{
              fontFamily: font.family,
              fontSize: compact ? font.size.sm : font.size.base,
              fontWeight: font.weight.semibold,
              color: color.textPrimary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {TAKASHI.displayName}
            </span>
            <span style={{ fontFamily: font.family, fontSize: font.size.xs, color: color.textSecondary }}>
              Llamada de voz · 00:47
            </span>
          </div>
        </div>
        <span style={statusPill}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: "#059669" }} />
          Traducción en tiempo real
        </span>
      </div>

      <div
        aria-label="Transcripción en vivo"
        role="log"
        aria-live="polite"
        style={{
          background: color.surfaceAlt,
          borderRadius: radius.md,
          padding: compact ? "8px" : `${space.sm}px ${space.md}px`,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          border: `1px solid ${color.border}`,
        }}
      >
        {shown.map((line) => {
          const isSelf = line.authorId === "self";
          const who = isSelf ? LAURA : TAKASHI;
          const accent = isSelf ? color.spablaCyan : color.spablaCoral;
          const inkAccent = isSelf ? color.spablaNavy : color.zoneOtherAccent;
          // UX-01-R2 · The primary content is always what LAURA needs
          // to read: her own Spanish for her turns, and Takashi's
          // Spanish translation for his. Secondary label reflects the
          // direction:
          //   · Laura: "Enviado en japonés" — she spoke ES, we sent JA.
          //   · Takashi: "Original: japonés" — he spoke JA, we show ES.
          const primaryLang: "es" | "ja" = isSelf ? line.original.language : line.translation.language;
          const primaryText = isSelf ? line.original.text : line.translation.text;
          const secondaryLang: "es" | "ja" = isSelf ? line.translation.language : line.original.language;
          const secondaryLabel = isSelf
            ? `Enviado en ${secondaryLang === "ja" ? "japonés" : "español"}`
            : `Original: ${secondaryLang === "ja" ? "japonés" : "español"}`;
          return (
            <div key={line.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{
                width: 4, height: compact ? 26 : 30, borderRadius: 4,
                background: accent, flexShrink: 0, marginTop: 3,
              }} aria-hidden="true" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                  <span style={{
                    fontFamily: font.family,
                    fontSize: font.size.xs,
                    fontWeight: font.weight.semibold,
                    color: inkAccent,
                  }}>
                    {who.displayName}
                  </span>
                  <span style={{ fontFamily: font.family, fontSize: font.size.xs, color: color.textMuted }}>{line.time}</span>
                </div>
                <div lang={primaryLang} style={{
                  fontFamily: primaryLang === "ja" ? font.jp : font.family,
                  color: color.textPrimary,
                  fontSize: compact ? font.size.sm : font.size.base,
                  marginTop: 1,
                  lineHeight: 1.35,
                }}>
                  {primaryText}
                </div>
                <div style={{
                  fontFamily: font.family, fontSize: 11, color: color.textMuted, marginTop: 1,
                }}>
                  {secondaryLabel}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        display: "flex",
        justifyContent: "center",
        gap: compact ? 10 : space.md,
        alignItems: "center",
      }}>
        <ControlButton label="Silenciar micrófono" compact={compact}><IconMic size={compact ? 16 : 18} /></ControlButton>
        <ControlButton label="Cambiar altavoz" compact={compact}><IconSpeaker size={compact ? 16 : 18} /></ControlButton>
        <ControlButton label="Ocultar subtítulos" pressed compact={compact}><IconCaptions size={compact ? 16 : 18} /></ControlButton>
        <Link
          href="?"
          aria-label="Finalizar llamada"
          prefetch={false}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: compact ? 46 : 52,
            height: compact ? 46 : 52,
            borderRadius: "50%",
            background: color.danger,
            color: "#FFFFFF",
            textDecoration: "none",
            boxShadow: "0 4px 10px rgba(239, 68, 68, 0.35)",
          }}
        >
          <IconEndCall size={compact ? 20 : 22} color="#FFFFFF" />
        </Link>
      </div>
    </section>
  );
}

function ControlButton({ children, label, pressed, compact }: {
  children: React.ReactNode; label: string; pressed?: boolean; compact?: boolean;
}): React.JSX.Element {
  const size = compact ? 40 : 46;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed ? true : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1px solid ${color.border}`,
        background: pressed ? color.spablaCyanSoft : color.surface,
        color: pressed ? color.spablaNavy : color.textSecondary,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
