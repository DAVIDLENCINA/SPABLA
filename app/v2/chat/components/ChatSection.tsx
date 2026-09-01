/**
 * SPABLA V2 · Hito 9.2.1 · Section container presentational.
 *
 * Sustituye únicamente la repetición visual de las tarjetas actuales de
 * `/v2/chat` (los cinco paneles: Contexto, Sesión, Idiomas,
 * Conversación, Enviar mensaje). Recibe `title` y `children`; NO altera
 * textos, controles, estado ni comportamiento — el contenido se pasa
 * tal cual desde `page.tsx`.
 *
 * @internal Presentational. Consumido desde `app/v2/chat/page.tsx`.
 */

import type { CSSProperties, ReactNode } from "react";

const sectionStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
  borderRadius: 8,
  padding: "0.75rem 1rem",
  marginTop: "1rem",
  color: "#0B0F19",
};

const titleStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  margin: "0 0 0.5rem",
  color: "#0B0F19",
};

export function ChatSection({
  title,
  children,
  minHeight,
}: Readonly<{
  title: string;
  children: ReactNode;
  minHeight?: number | string;
}>): React.JSX.Element {
  const style: CSSProperties = minHeight === undefined ? sectionStyle : { ...sectionStyle, minHeight };
  return (
    <section style={style}>
      <h2 style={titleStyle}>{title}</h2>
      {children}
    </section>
  );
}
