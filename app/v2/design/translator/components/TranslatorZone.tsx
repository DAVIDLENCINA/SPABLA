import type { CSSProperties } from "react";
import { color, font, radius, space } from "../../chat/styles/tokens";
import { IconMic, IconStop } from "../../chat/components/Icons";

type Props = {
  readonly role: "self" | "other";
  readonly languageName: string;
  readonly source: string;
  readonly sourceLang: "es" | "ja";
  readonly translated: string;
  readonly translatedLang: "es" | "ja";
  readonly listening: boolean;
  readonly active: boolean;
};

/**
 * Tap-to-talk zone for the Modo Traductor. Blue for Laura (self),
 * coral for the other person — the two-colour split guarantees
 * the wrong mic can never be activated by accident. Density
 * tightened for the UX-01-R revision: mic sits close to the text,
 * no dead vertical space, still WCAG-friendly targets.
 */
export function TranslatorZone({
  role, languageName, source, sourceLang, translated, translatedLang, listening, active,
}: Props): React.JSX.Element {
  const isSelf = role === "self";
  const accent = isSelf ? color.zoneSelfAccent : color.zoneOtherAccent;
  const accentSoft = isSelf ? color.spablaCyanSoft : color.spablaCoralSoft;
  const brandDot = isSelf ? color.spablaCyan : color.spablaCoral;
  const roleLabel = isSelf ? "Tú" : "Otra persona";

  const wrap: CSSProperties = {
    background: color.surface,
    border: `1px solid ${active ? accent : color.border}`,
    borderRadius: radius.lg,
    padding: `${space.md}px`,
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    boxShadow: active ? `0 4px 14px ${accent}22` : "0 1px 2px rgba(15, 23, 42, 0.04)",
    height: "100%",
    minHeight: 0,
    position: "relative",
    boxSizing: "border-box",
    overflow: "hidden",
  };
  const headerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
    flexShrink: 0,
  };
  const roleText: CSSProperties = {
    fontFamily: font.family,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: accent,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
  const langText: CSSProperties = {
    fontFamily: font.family,
    fontSize: font.size.xs,
    color: color.textMuted,
  };
  const listenPill: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 8px",
    borderRadius: radius.pill,
    background: accentSoft,
    color: accent,
    fontFamily: font.family,
    fontSize: 11,
    fontWeight: font.weight.semibold,
  };
  const sourceStyle: CSSProperties = {
    fontFamily: sourceLang === "ja" ? font.jp : font.family,
    fontSize: "1.25rem",
    fontWeight: font.weight.semibold,
    color: color.textPrimary,
    lineHeight: 1.25,
    margin: `${space.xs}px 0 0`,
  };
  const translatedLabel: CSSProperties = {
    fontFamily: font.family,
    fontSize: font.size.xs,
    color: accent,
    fontWeight: font.weight.semibold,
    marginTop: space.sm,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  };
  const translatedStyle: CSSProperties = {
    fontFamily: translatedLang === "ja" ? font.jp : font.family,
    fontSize: font.size.base,
    color: color.textSecondary,
    lineHeight: 1.35,
    margin: "2px 0 0",
  };
  // The mic sits close to the content (not pinned to the bottom)
  // so tablet zones no longer feel visually empty. Vertical
  // centering of the whole card handles the residual space above
  // and below.
  const micRow: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    marginTop: space.md,
  };
  const micSize = 60;
  const micStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: micSize,
    height: micSize,
    borderRadius: "50%",
    border: "none",
    background: accent,
    color: "#FFFFFF",
    cursor: "pointer",
    boxShadow: `0 6px 18px ${accent}55`,
  };
  return (
    <section
      style={wrap}
      role="region"
      aria-label={`Zona de ${roleLabel} en ${languageName}`}
      aria-live={active ? "polite" : undefined}
    >
      <div style={headerStyle}>
        <div>
          <div style={roleText}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: brandDot, display: "inline-block" }} aria-hidden="true" />
            {roleLabel}
          </div>
          <div style={langText}>{languageName}</div>
        </div>
        <span style={listenPill}>
          <Waveform accent={accent} active={listening} />
          {listening ? "Escuchando…" : "En espera"}
        </span>
      </div>
      <div style={{
        flex: "1 1 auto",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}>
        <p style={sourceStyle} lang={sourceLang}>{source}</p>
        <div>
          <div style={translatedLabel}>Traducido al {translatedLang === "ja" ? "japonés" : "español"}</div>
          <p style={translatedStyle} lang={translatedLang}>{translated}</p>
        </div>
        <div style={micRow}>
          <button type="button" aria-label={active ? `Detener escucha de ${roleLabel}` : `Empezar a hablar como ${roleLabel}`}
                  aria-pressed={active} style={micStyle}>
            {active ? <IconStop size={20} color="#FFFFFF" /> : <IconMic size={20} color="#FFFFFF" />}
          </button>
          <div style={{
            textAlign: "center", color: color.textSecondary,
            fontFamily: font.family, fontSize: 11,
          }}>
            {active ? "Toca para detener" : "Toca para hablar"}
          </div>
        </div>
      </div>
    </section>
  );
}

function Waveform({ accent, active }: { accent: string; active: boolean }): React.JSX.Element {
  const bars = [8, 14, 20, 14, 22, 12, 18, 10];
  return (
    <svg width={52} height={16} viewBox="0 0 52 16" aria-hidden="true">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * 6.5}
          y={(16 - (h * 0.6)) / 2}
          width={3}
          height={h * 0.6}
          rx={1.5}
          fill={accent}
          opacity={active ? 0.95 : 0.28}
        />
      ))}
    </svg>
  );
}
