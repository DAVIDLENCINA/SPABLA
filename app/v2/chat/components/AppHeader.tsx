import Image from "next/image";

import { chatColor, chatSpace } from "../styles";

/**
 * Productive SPABLA brand header.
 *
 * UX-02 keeps a single brand presence on the productive chat surface.
 * No prototype fixtures or navigation behaviour live here.
 */
export function AppHeader(): React.JSX.Element {
  return (
    <header
      data-role="productive-brand-header"
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: 60,
        padding: `${chatSpace.md}px ${chatSpace.lg}px`,
        background: chatColor.surface,
        borderBottom: `1px solid ${chatColor.border}`,
        boxSizing: "border-box",
      }}
    >
      {/*
        UX-02 · Logo horizontal oficial productivo con fondo transparente
        (RGBA 2172×724). Reemplaza al histórico `/SPABLA_LOGO.png`, que
        traía un fondo Negro Profundo baked-in y sobre la cabecera
        blanca leía como un rectángulo. Este PNG transparente evita el
        halo sin recortes ni filtros. Asset estático productivo bajo
        `public/`.
      */}
      <Image
        src="/SPABLA_LOGO_HORIZONTAL.png"
        alt="SPABLA"
        width={158}
        height={53}
        priority
        style={{
          width: "auto",
          height: 34,
          objectFit: "contain",
        }}
      />
    </header>
  );
}
