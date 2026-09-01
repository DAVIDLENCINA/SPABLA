/**
 * SPABLA V2 · UX-02 · Barra compacta de idiomas.
 *
 * Presentational. Mantiene contratos:
 *   - Recibe la lista completa `options` desde `page.tsx`.
 *   - No valida internamente (`isLangCode` sigue en `page.tsx`).
 *   - Los captions `writeCaption`/`readCaption` los inyecta `page.tsx`.
 *
 * UX-02 · Aplica la paleta y espaciado promovidos desde UX-01-R2 vía
 * `../styles.ts` (nunca importa `app/v2/design/**`). Sin cambios en
 * los handlers ni en los códigos ISO expuestos por los selectores.
 */

import type { CSSProperties } from "react";

import { chatColor, chatFont, chatRadius, chatSpace } from "../styles";

const barStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: chatSpace.md,
  padding: `${chatSpace.sm}px ${chatSpace.lg}px`,
  background: chatColor.surface,
  borderBottom: `1px solid ${chatColor.border}`,
  flexShrink: 0,
};

const labelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: chatSpace.sm,
  flex: "1 1 240px",
  minWidth: 0,
  fontSize: chatFont.size.sm,
  color: chatColor.textSecondary,
};

const captionStyle: CSSProperties = {
  whiteSpace: "nowrap",
  color: chatColor.textSecondary,
  fontWeight: chatFont.weight.medium,
};

const selectStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: chatFont.size.sm,
  fontFamily: "inherit",
  color: chatColor.textPrimary,
  background: chatColor.surface,
  border: `1px solid ${chatColor.border}`,
  borderRadius: chatRadius.sm,
  padding: `${chatSpace.xs}px ${chatSpace.sm}px`,
  cursor: "pointer",
};

export type LanguageOption = { readonly code: string; readonly label: string };

export function LanguageControls({
  options,
  myLanguage,
  targetLanguage,
  onMyLanguageChange,
  onTargetLanguageChange,
  writeCaption,
  readCaption,
  disabled,
}: Readonly<{
  options: ReadonlyArray<LanguageOption>;
  myLanguage: string;
  targetLanguage: string;
  onMyLanguageChange: (next: string) => void;
  onTargetLanguageChange: (next: string) => void;
  writeCaption: string;
  readCaption: string;
  disabled?: boolean;
}>): React.JSX.Element {
  return (
    <div style={barStyle} role="group" aria-label="Preferencias de idioma">
      <label style={labelStyle}>
        <span style={captionStyle}>{writeCaption}</span>
        <select
          value={myLanguage}
          onChange={(e) => onMyLanguageChange(e.target.value)}
          disabled={disabled}
          style={selectStyle}
          aria-label={writeCaption}
        >
          {options.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        <span style={captionStyle}>{readCaption}</span>
        <select
          value={targetLanguage}
          onChange={(e) => onTargetLanguageChange(e.target.value)}
          disabled={disabled}
          style={selectStyle}
          aria-label={readCaption}
        >
          {options.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
