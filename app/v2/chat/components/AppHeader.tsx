/**
 * SPABLA V2 · Hito 9.2.1 · Presentational header component.
 *
 * Muestra el activo oficial `public/SPABLA_LOGO.png` (isotipo + wordmark)
 * junto al título "Chat" sobre fondo Negro Profundo (#0B0F19). El fondo
 * dark es intencional: el logo oficial trae un fondo Negro Profundo
 * baked-in y presentarlo sobre otra tinta introduciría un halo o caja
 * indeseada. Al fusionar el bg de la cabecera con el bg del PNG, el
 * logotipo se muestra sin deformación, sin recorte, sin filtro y sin
 * caja visible — conforme a las normas de identidad corporativa.
 *
 * Dimensiones: se usan valores numéricos derivados del ratio real del
 * activo (4054 × 838 px, ratio 4.836…). Para altura 48 px → anchura 232
 * px (desviación 0.08 % del ratio original, imperceptible).
 *
 * No contiene estado, sesión, fetch ni lógica de negocio. Recibe todo
 * lo que necesita por props (por ahora, ninguna prop pública — el
 * título "Chat" es fijo en este incremento).
 *
 * @internal Presentational. Consumido desde `app/v2/chat/page.tsx`.
 */

import type { CSSProperties } from "react";
import Image from "next/image";

// Fondo Negro Profundo oficial — coincide con el baked-in del PNG.
const HEADER_BG = "#0B0F19";
// Blanco oficial.
const TITLE_COLOR = "#FFFFFF";

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.85rem",
  padding: "0.5rem 1rem",
  background: HEADER_BG,
  color: TITLE_COLOR,
  width: "100%",
  boxSizing: "border-box",
  // Área de protección alrededor del logo garantizada por el padding
  // horizontal + el gap con el título. Sin sombras, sin gradientes.
};

const titleStyle: CSSProperties = {
  fontSize: "1.05rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  color: TITLE_COLOR,
  // Tipografía del sistema — nunca reemplaza la tipografía del logo,
  // que va renderizada dentro del PNG oficial.
};

export function AppHeader(): React.JSX.Element {
  return (
    <header style={headerStyle} role="banner">
      <Image
        src="/SPABLA_LOGO.png"
        alt="SPABLA"
        width={232}
        height={48}
        priority
      />
      <span style={titleStyle}>Chat</span>
    </header>
  );
}
