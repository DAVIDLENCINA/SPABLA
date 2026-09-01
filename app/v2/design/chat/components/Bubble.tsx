import type { CSSProperties } from "react";
import { color, font, radius, space } from "../styles/tokens";
import { LAURA, TAKASHI } from "../fixtures/identities";
import type { MessageEvent } from "../fixtures/timeline";
import type { OriginalMode } from "../state";
import { Avatar } from "./Avatar";

type Props = {
  readonly message: MessageEvent;
  readonly showOriginal: OriginalMode;
};

const jpFontFamily = "'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', system-ui, sans-serif";

function fontFor(lang: "es" | "ja"): string {
  return lang === "ja" ? jpFontFamily : font.family;
}

/**
 * Message bubble with the UX-01-R translation model:
 *
 *   · For Laura (self): primary content = the SPANISH she wrote
 *     (`original.text`). Secondary label: "Enviado en japonés ·
 *     Ver traducción" which expands the Japanese INSIDE the same
 *     bubble, separated by a subtle divisor.
 *   · For Takashi (peer): primary content = the SPANISH translation
 *     Laura needs to read (`translation.text`). Secondary label:
 *     "Original: japonés · Ver original" which expands the Japanese
 *     inside the same bubble.
 *
 * No large separate white cards; the secondary content is always
 * visually attached to its bubble.
 */
export function Bubble({ message, showOriginal }: Props): React.JSX.Element {
  const isSelf = message.authorId === "self";
  const author = isSelf ? LAURA : TAKASHI;

  // Primary language + text — the one shown big.
  const primaryLang: "es" | "ja" = isSelf ? message.original.language : message.translation.language;
  const primaryText = isSelf ? message.original.text : message.translation.text;

  // Secondary language + text — the alternative view (translation
  // for self, original for peer).
  const secondaryLang: "es" | "ja" = isSelf ? message.translation.language : message.original.language;
  const secondaryText = isSelf ? message.translation.text : message.original.text;

  // Only meaningful when the two languages actually differ.
  const hasSecondary = primaryLang !== secondaryLang;
  const languageName = (l: "es" | "ja"): string => (l === "ja" ? "japonés" : "español");

  const rowStyle: CSSProperties = {
    display: "flex",
    justifyContent: isSelf ? "flex-end" : "flex-start",
    gap: space.sm,
    alignItems: "flex-end",
    marginBottom: 6,
    maxWidth: "100%",
  };
  const stackStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: isSelf ? "flex-end" : "flex-start",
    gap: 2,
    maxWidth: "min(560px, 82%)",
    minWidth: 0,
  };
  const bubbleStyle: CSSProperties = {
    display: "inline-flex",
    flexDirection: "column",
    padding: "8px 12px",
    borderRadius: radius.bubble,
    background: isSelf ? color.bubbleSelfBg : color.bubbleOtherBg,
    color: isSelf ? color.bubbleSelfText : color.bubbleOtherText,
    fontFamily: fontFor(primaryLang),
    fontSize: font.size.base,
    lineHeight: 1.35,
    boxShadow: isSelf ? "none" : "0 1px 2px rgba(15,23,42,0.05)",
    maxWidth: "100%",
    overflowWrap: "anywhere",
    wordBreak: "normal",
  };
  const dividerColor = isSelf ? "rgba(11, 15, 25, 0.16)" : color.border;
  const secondaryTextStyle: CSSProperties = {
    fontFamily: fontFor(secondaryLang),
    fontSize: font.size.sm,
    color: isSelf ? "rgba(11, 15, 25, 0.72)" : color.textSecondary,
    marginTop: 6,
    paddingTop: 6,
    borderTop: `1px solid ${dividerColor}`,
    lineHeight: 1.35,
  };
  const metaLine: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: font.family,
    fontSize: font.size.xs,
    color: color.textMuted,
    padding: `0 ${space.xs}px`,
    flexWrap: "wrap",
  };
  const linkBtn: CSSProperties = {
    border: "none",
    background: "transparent",
    padding: 0,
    color: color.spablaNavy,
    cursor: "pointer",
    fontFamily: font.family,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textDecoration: "underline",
  };
  const secondaryLabel = isSelf
    ? `Enviado en ${languageName(secondaryLang)}`
    : `Original: ${languageName(secondaryLang)}`;
  const actionLabel = isSelf ? "Ver traducción" : "Ver original";
  const actionHideLabel = isSelf ? "Ocultar traducción" : "Ocultar original";

  return (
    <div style={rowStyle}>
      {!isSelf ? <Avatar src={author.avatarDataUri} name={author.displayName} size={28} /> : null}
      <div style={stackStyle}>
        <div style={bubbleStyle}>
          <span lang={primaryLang}>{primaryText}</span>
          {hasSecondary && showOriginal === "visible" ? (
            <span style={secondaryTextStyle} lang={secondaryLang}>
              {secondaryText}
            </span>
          ) : null}
        </div>
        <div style={metaLine}>
          {hasSecondary ? (
            <>
              <span>{secondaryLabel}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                aria-label={showOriginal === "visible" ? actionHideLabel : actionLabel}
                aria-pressed={showOriginal === "visible"}
                style={linkBtn}
              >
                {showOriginal === "visible" ? "Ocultar" : actionLabel}
              </button>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>{message.time}</span>
          {isSelf && message.deliveredTicks ? (
            <span aria-label="Entregado" style={{ letterSpacing: "-0.1em", color: color.spablaNavy }}>
              ✓✓
            </span>
          ) : null}
        </div>
      </div>
      {isSelf ? <Avatar src={author.avatarDataUri} name={author.displayName} size={28} /> : null}
    </div>
  );
}
