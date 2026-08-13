/**
 * SPABLA V2 · Hito 9.2.1 · Layout frame presentational.
 *
 * Envuelve cabecera + contenido de `/v2/chat`. Conserva la clase
 * `spabla-v2-scope` dentro del árbol protegido por
 * `app/v2/layout.tsx` (hito 9.1.1 · corrección de contraste Safari
 * dark). Aplica un ancho máximo legible y espaciado responsive
 * uniforme para 375 / 768 / 1440 px sin nuevas dependencias visuales.
 *
 * No contiene estado, sesión, fetch, ni lógica de negocio. Recibe
 * `header` y `children` por props; el consumidor decide qué pintar
 * dentro.
 *
 * @internal Presentational. Consumido desde `app/v2/chat/page.tsx`.
 */

import type { CSSProperties, ReactNode } from "react";

const frameStyle: CSSProperties = {
  // El fondo del propio /v2/** ya lo pinta el wrapper `.spabla-v2-scope`
  // del layout (Hito 9.1.1). Aquí sólo estructuramos flujo.
  display: "flex",
  flexDirection: "column",
  minHeight: "100vh",
  width: "100%",
};

const mainStyle: CSSProperties = {
  // Ancho legible en escritorio, expansión completa en móvil.
  maxWidth: "960px",
  width: "100%",
  margin: "0 auto",
  padding: "1rem",
  boxSizing: "border-box",
  // Sistema de fuentes sin dependencia externa.
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  // Color de texto principal alineado con la paleta oficial (§ Negro Profundo).
  color: "#0B0F19",
};

export function ChatPageFrame({
  header,
  children,
}: Readonly<{ header: ReactNode; children: ReactNode }>): React.JSX.Element {
  return (
    <div style={frameStyle}>
      {header}
      <main style={mainStyle}>{children}</main>
    </div>
  );
}
