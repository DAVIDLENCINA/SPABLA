/**
 * SPABLA V2 · Hito 9.2.2 · Barra compacta de idiomas.
 *
 * Presentational. Sustituye el bloque "Idiomas" técnico por una barra
 * compacta con dos selectores etiquetados en lenguaje natural:
 *
 *   - "Escribo en"
 *   - "Leo en"
 *
 * Recibe la lista completa de opciones (`options`), los códigos actuales
 * y los handlers idénticos a los que ya vivían en `page.tsx`. No cambia
 * códigos ISO ni valida internamente (la validación `isLangCode` sigue
 * dentro de los handlers en `page.tsx`).
 */

import type { CSSProperties } from "react";

const DEEP = "#0B0F19";
const MUTED = "#475569";
const BORDER = "#E2E8F0";

const barStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
  padding: "0.65rem 1rem",
  background: "#FFFFFF",
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  marginTop: "0.75rem",
};

const labelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flex: "1 1 220px",
  minWidth: 0,
  fontSize: "0.85rem",
  color: MUTED,
};

const captionStyle: CSSProperties = {
  whiteSpace: "nowrap",
  color: MUTED,
};

const selectStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: "0.9rem",
  padding: "0.35rem 0.5rem",
  color: DEEP,
};

export type LanguageOption = { readonly code: string; readonly label: string };

/**
 * Los captions `writeCaption` y `readCaption` los inyecta `page.tsx`
 * con los literales heredados del Hito 9.1.1 ("Yo escribo en" /
 * "Leer mensajes en"). Presentacional: no valida internamente los
 * códigos, no ejecuta fetch, no toca sesión.
 */
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
