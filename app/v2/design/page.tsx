import Link from "next/link";
import type { CSSProperties } from "react";

const cardStyle: CSSProperties = {
  display: "block",
  padding: "20px 24px",
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 16,
  textDecoration: "none",
  color: "#0B0F19",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const chip = (label: string): CSSProperties => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  background: "#EEF6FF",
  color: "#1D4ED8",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "system-ui, -apple-system, sans-serif",
});

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

/**
 * Index of the UX-01 prototype. Not part of the productive `/v2/chat`
 * flow — this page exists so the reviewer can jump between the
 * 17 demonstrable states without editing URLs by hand.
 */
export default function UxDesignIndex(): React.JSX.Element {
  const wrap: CSSProperties = {
    padding: "40px 24px 80px",
    maxWidth: 1120,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, sans-serif",
  };
  const linkRow: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 };

  const linkStyle: CSSProperties = {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    color: "#1D4ED8",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 500,
  };

  return (
    <main style={wrap}>
      <header style={{ marginBottom: 24 }}>
        <span style={chip("UX-01")}>UX-01 · Prototipo visual</span>
        <h1 style={{ fontSize: 32, margin: "12px 0 6px" }}>SPABLA · Prototipo unificado</h1>
        <p style={{ color: "#475569", fontSize: 16, maxWidth: 720, margin: 0 }}>
          Estudio visual local. Cero backend, cero Supabase, cero cámara/micrófono real.
          Todo el contenido es ficticio y determinista. Ruta productiva <code>/v2/chat</code> intacta.
        </p>
      </header>

      <section style={grid}>
        <div style={cardStyle}>
          <span style={chip("Chat + traducción")}>Chat + traducción</span>
          <h2 style={{ fontSize: 18, margin: "10px 0 6px" }}>Estados de chat</h2>
          <p style={{ color: "#475569", fontSize: 14, margin: 0 }}>Texto puro, original oculto/visible.</p>
          <div style={linkRow}>
            <Link href="/v2/design/chat" style={linkStyle}>Chat texto</Link>
            <Link href="/v2/design/chat?original=visible" style={linkStyle}>Original visible</Link>
            <Link href="/v2/design/chat?device=mobile" style={linkStyle}>Móvil</Link>
          </div>
        </div>

        <div style={cardStyle}>
          <span style={chip("Voz integrada")}>Voz en el chat</span>
          <h2 style={{ fontSize: 18, margin: "10px 0 6px" }}>Llamada de voz</h2>
          <p style={{ color: "#475569", fontSize: 14, margin: 0 }}>Overlay dentro de la conversación + transcripción.</p>
          <div style={linkRow}>
            <Link href="/v2/design/chat?call=voice" style={linkStyle}>Voz activa</Link>
            <Link href="/v2/design/chat?call=voice-ended" style={linkStyle}>Voz finalizada</Link>
          </div>
        </div>

        <div style={cardStyle}>
          <span style={chip("Vídeo integrado")}>Vídeo en el chat</span>
          <h2 style={{ fontSize: 18, margin: "10px 0 6px" }}>Videollamada</h2>
          <p style={{ color: "#475569", fontSize: 14, margin: 0 }}>Subtítulos on/off, minimizado y finalización.</p>
          <div style={linkRow}>
            <Link href="/v2/design/chat?call=video&subs=on" style={linkStyle}>Vídeo · subs on</Link>
            <Link href="/v2/design/chat?call=video&subs=off" style={linkStyle}>Vídeo · subs off</Link>
            <Link href="/v2/design/chat?call=video-min" style={linkStyle}>Minimizado</Link>
            <Link href="/v2/design/chat?call=video-ended" style={linkStyle}>Vídeo finalizado</Link>
            <Link href="/v2/design/chat?call=video&device=mobile&subs=on" style={linkStyle}>Móvil vídeo</Link>
          </div>
        </div>

        <div style={cardStyle}>
          <span style={chip("Inbox móvil")}>Inbox móvil</span>
          <h2 style={{ fontSize: 18, margin: "10px 0 6px" }}>Pantalla principal Chats · móvil</h2>
          <p style={{ color: "#475569", fontSize: 14, margin: 0 }}>Logo SPABLA + lista + navegación inferior.</p>
          <div style={linkRow}>
            <Link href="/v2/design/inbox" style={linkStyle}>Inbox móvil</Link>
          </div>
        </div>

        <div style={cardStyle}>
          <span style={chip("Modo Traductor")}>Modo Traductor</span>
          <h2 style={{ fontSize: 18, margin: "10px 0 6px" }}>Cara a cara</h2>
          <p style={{ color: "#475569", fontSize: 14, margin: 0 }}>Tablet lado a lado + móvil giro 180 para la persona enfrente.</p>
          <div style={linkRow}>
            <Link href="/v2/design/translator" style={linkStyle}>Tablet</Link>
            <Link href="/v2/design/translator?turn=other" style={linkStyle}>Turno del otro</Link>
            <Link href="/v2/design/translator?swap=1" style={linkStyle}>Intercambio</Link>
            <Link href="/v2/design/translator?device=mobile" style={linkStyle}>Móvil cara a cara</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
