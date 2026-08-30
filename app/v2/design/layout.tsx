import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";

/**
 * SPABLA · UX-01 · Local design study layout.
 *
 * Reads `light` colour scheme and a neutral background so the
 * prototype renders consistently regardless of the user-agent dark
 * mode. Zero dependencies on Supabase, auth, or the productive
 * `/v2/chat` layout.
 *
 * The scoped CSS below hides Next.js dev-mode overlays for the
 * `/v2/design/**` subtree so the capture harness produces clean
 * screenshots. It NEVER runs in production builds (the dev overlay
 * DOM only exists under `next dev`).
 */

export const metadata: Metadata = {
  title: "SPABLA · Prototipo UX-01",
  description: "Prototipo visual local del sistema unificado SPABLA (chat + traducción + voz + vídeo + Modo Traductor).",
  robots: { index: false, follow: false },
};

const wrapperStyle: CSSProperties = {
  colorScheme: "light",
  background: "#F8FAFC",
  color: "#0B0F19",
  minHeight: "100dvh",
  width: "100%",
};

const hideDevOverlayCss = `
  /* Next.js dev overlays — hidden ONLY while the UX-01 prototype
     scope is on-screen so capture harnesses produce clean shots. */
  body:has(.spabla-ux01-scope) nextjs-portal,
  body:has(.spabla-ux01-scope) [data-next-badge],
  body:has(.spabla-ux01-scope) [data-next-badge-root],
  body:has(.spabla-ux01-scope) [data-nextjs-toast],
  body:has(.spabla-ux01-scope) [data-nextjs-dialog-root] { display: none !important; }
`;

export default function UxDesignLayout({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return (
    <div className="spabla-ux01-scope" style={wrapperStyle}>
      <style dangerouslySetInnerHTML={{ __html: hideDevOverlayCss }} />
      {children}
    </div>
  );
}
