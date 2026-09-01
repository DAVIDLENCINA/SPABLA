import Link from "next/link";
import type { CSSProperties } from "react";
import { color, font, radius, space } from "../../chat/styles/tokens";
import { LangSwitcher } from "../../chat/components/LangSwitcher";
import type { PrototypeState } from "../../chat/state";
import { TRANSLATOR_HISTORY } from "../../chat/fixtures/timeline";
import { IconSwap } from "../../chat/components/Icons";
import { TranslatorFooter } from "./TranslatorFooter";
import { TranslatorHeader } from "./TranslatorHeader";
import { TranslatorZone } from "./TranslatorZone";

type Props = { readonly state: PrototypeState };

/**
 * Modo Traductor. Two layouts:
 *
 *   · Desktop / tablet: two side-by-side zones with a language swap
 *     divider in the middle.
 *   · Mobile face-to-face: the OTHER person's zone sits on top and
 *     is ROTATED 180° so the phone can rest between two people on
 *     a table. Only that content flips; footer controls and the
 *     brand chip stay upright for whoever holds the phone.
 */
export function TranslatorShell({ state }: Props): React.JSX.Element {
  const isMobile = state.device === "mobile";
  const swapped = state.swapped;
  const selfLangName = swapped ? "Japonés" : "Español";
  const otherLangName = swapped ? "Español" : "Japonés";
  const selfLang: "es" | "ja" = swapped ? "ja" : "es";
  const otherLang: "es" | "ja" = swapped ? "es" : "ja";

  const currentTurn = state.translatorTurn;
  const [selfTurn, otherTurnFx] = TRANSLATOR_HISTORY;

  const langBar: CSSProperties = {
    display: "flex",
    justifyContent: "center",
    padding: `${space.xs}px ${space.md}px`,
    background: color.surface,
    borderBottom: `1px solid ${color.border}`,
    flexShrink: 0,
  };

  if (isMobile) {
    return (
      <div data-role="translator-shell" data-device="mobile"
           style={{
             display: "flex",
             flexDirection: "column",
             height: "100dvh",
             background: color.surfaceAlt,
             overflow: "hidden",
           }}>
        <TranslatorHeader compact />
        <div style={langBar}>
          <LangSwitcher self={selfLangName} other={otherLangName} selfCode={selfLang} otherCode={otherLang} compact />
        </div>
        <div style={{
          display: "grid",
          gridTemplateRows: "1fr auto 1fr",
          gap: 8,
          padding: 8,
          minHeight: 0,
          flex: "1 1 auto",
        }}>
          <div style={{ transform: "rotate(180deg)", transformOrigin: "center", minHeight: 0 }}>
            <TranslatorZone
              role="other"
              languageName={otherLangName}
              source={otherTurnFx!.source.text}
              sourceLang={otherTurnFx!.source.language}
              translated={otherTurnFx!.translated.text}
              translatedLang={otherTurnFx!.translated.language}
              listening={currentTurn === "other"}
              active={currentTurn === "other"}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
            <Link href={swapped ? "?device=mobile" : "?device=mobile&swap=1"} prefetch={false}
              aria-label="Intercambiar idiomas"
              style={{
                width: 36, height: 36, borderRadius: "50%",
                border: `1px solid ${color.border}`, background: color.surface,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                textDecoration: "none", color: color.textSecondary,
                boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
              }}>
              <IconSwap size={14} />
            </Link>
          </div>
          <div style={{ minHeight: 0 }}>
            <TranslatorZone
              role="self"
              languageName={selfLangName}
              source={selfTurn!.source.text}
              sourceLang={selfTurn!.source.language}
              translated={selfTurn!.translated.text}
              translatedLang={selfTurn!.translated.language}
              listening={currentTurn === "self"}
              active={currentTurn === "self"}
            />
          </div>
        </div>
        <TranslatorFooter compact />
      </div>
    );
  }

  return (
    <div data-role="translator-shell" data-device="desktop"
         style={{
           display: "flex",
           flexDirection: "column",
           height: "100dvh",
           background: color.surfaceAlt,
           overflow: "hidden",
         }}>
      <TranslatorHeader />
      <div style={langBar}>
        <LangSwitcher self={selfLangName} other={otherLangName} selfCode={selfLang} otherCode={otherLang} />
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 48px 1fr",
        gap: space.md,
        padding: `${space.md}px ${space.xl}px`,
        alignItems: "stretch",
        minHeight: 0,
        flex: "1 1 auto",
      }}>
        <TranslatorZone
          role="self"
          languageName={selfLangName}
          source={selfTurn!.source.text}
          sourceLang={selfTurn!.source.language}
          translated={selfTurn!.translated.text}
          translatedLang={selfTurn!.translated.language}
          listening={currentTurn === "self"}
          active={currentTurn === "self"}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Link href={swapped ? "?" : "?swap=1"} prefetch={false} aria-label="Intercambiar idiomas"
            style={{
              width: 44, height: 44, borderRadius: "50%",
              border: `1px solid ${color.border}`, background: color.surface,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              textDecoration: "none", color: color.textSecondary,
              boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
            }}>
            <IconSwap size={16} />
          </Link>
        </div>
        <TranslatorZone
          role="other"
          languageName={otherLangName}
          source={otherTurnFx!.source.text}
          sourceLang={otherTurnFx!.source.language}
          translated={otherTurnFx!.translated.text}
          translatedLang={otherTurnFx!.translated.language}
          listening={currentTurn === "other"}
          active={currentTurn === "other"}
        />
      </div>
      <TranslatorFooter />
    </div>
  );
}

// radius import used implicitly by CSSProperties; keep an import
// reference so tsc doesn't drop it in other bundlers.
void radius;
void font;
