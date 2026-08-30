import Link from "next/link";
import type { CSSProperties } from "react";
import { color, font, radius, space } from "../styles/tokens";
import { LAURA } from "../fixtures/identities";
import type { SubsMode } from "../state";
import {
  IconCaptions,
  IconEndCall,
  IconExpand,
  IconMic,
  IconMinimize,
  IconSpeaker,
  IconVideo,
} from "./Icons";

type Props = {
  readonly subs: SubsMode;
  readonly minimized: boolean;
  readonly compact?: boolean;
};

/**
 * Video call surface. Uses inline SVG scenes for the remote and
 * self streams — zero real camera, zero WebRTC. The scene fills
 * the whole card, the self-view sits as a PiP in the top-right,
 * subtitles anchor to a safe bottom strip so the rostro is never
 * covered. In compact mode the top pills stack and the PiP shrinks
 * to fit narrow viewports without overlapping the "Traducción en
 * tiempo real" state.
 */
export function VideoCallCard({ subs, minimized, compact }: Props): React.JSX.Element {
  if (minimized) return <MinimizedPip subs={subs} />;
  const wrap: CSSProperties = {
    margin: compact ? `${space.sm}px ${space.md}px 0` : `${space.sm}px ${space.xl}px`,
    background: "#0B0F19",
    borderRadius: radius.lg,
    overflow: "hidden",
    position: "relative",
    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.15)",
    flexShrink: 0,
  };
  const stage: CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio: compact ? "3 / 4" : "16 / 10",
    background: "linear-gradient(160deg, #0E1224 0%, #0B1332 100%)",
  };
  const topBar: CSSProperties = {
    position: "absolute",
    top: 10,
    left: 10,
    right: compact ? 96 : 12,  // leave room for PiP top-right
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    alignItems: "flex-start",
    zIndex: 3,
  };
  const pillDark: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 9px",
    borderRadius: radius.pill,
    background: "rgba(15, 23, 42, 0.6)",
    color: "#FFFFFF",
    fontFamily: font.family,
    fontSize: 11,
    fontWeight: font.weight.semibold,
    backdropFilter: "blur(6px)",
    whiteSpace: "nowrap",
  };
  const placeholderChip: CSSProperties = {
    position: "absolute",
    left: 10,
    bottom: subs === "on" ? (compact ? 128 : 108) : (compact ? 66 : 82),
    padding: "3px 8px",
    borderRadius: radius.pill,
    background: "rgba(255, 255, 255, 0.14)",
    color: "rgba(255,255,255,0.85)",
    fontFamily: font.family,
    fontSize: 10,
    fontWeight: font.weight.semibold,
    letterSpacing: "0.03em",
    zIndex: 3,
    textTransform: "uppercase",
  };
  return (
    <section
      style={wrap}
      role="region"
      aria-label="Videollamada activa con Takashi Mori"
      aria-live="polite"
    >
      <div style={stage}>
        <RemoteScene />
        <SelfPip compact={compact} />

        <div style={topBar}>
          <span style={pillDark}>
            <IconVideo size={12} color="#FFFFFF" />
            Videollamada · 01:12
          </span>
          <span style={pillDark}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E" }} />
            Traducción en tiempo real
          </span>
        </div>

        <span style={placeholderChip} aria-label="Escena ilustrativa del prototipo">Ilustración placeholder</span>

        {subs === "on" ? <SubtitlesLayer compact={compact} /> : null}
      </div>

      <ControlsBar subs={subs} compact={compact} />
    </section>
  );
}

function MinimizedPip({ subs }: { subs: SubsMode }): React.JSX.Element {
  const wrap: CSSProperties = {
    position: "absolute",
    right: 16,
    bottom: 74,
    width: 200,
    borderRadius: radius.md,
    overflow: "hidden",
    background: "#0B0F19",
    boxShadow: "0 10px 25px rgba(15,23,42,0.25)",
    zIndex: 5,
  };
  const stage: CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio: "3 / 4",
  };
  return (
    <section
      style={wrap}
      role="region"
      aria-label="Videollamada minimizada con Takashi Mori"
    >
      <div style={stage}>
        <RemoteScene mini />
        <div style={{
          position: "absolute", left: 6, top: 6,
          background: "rgba(15,23,42,0.55)", color: "#FFFFFF",
          padding: "3px 8px", borderRadius: 999,
          fontFamily: font.family, fontSize: 11, fontWeight: font.weight.semibold,
        }}>Takashi · 01:12</div>
        {subs === "on" ? (
          <div style={{
            position: "absolute", bottom: 38, left: 6, right: 6,
            padding: "5px 7px", borderRadius: 6,
            background: "rgba(15,23,42,0.7)", color: "#FFFFFF",
            fontFamily: font.family, fontSize: 11, lineHeight: 1.3,
          }}>Entonces nos vemos a las siete.</div>
        ) : null}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          background: "rgba(15,23,42,0.85)", padding: 5,
          display: "flex", justifyContent: "space-around",
        }}>
          <Link href="?call=video" prefetch={false} aria-label="Expandir vídeo"
            style={{ background: "transparent", color: "#FFFFFF", padding: 4, borderRadius: 6 }}>
            <IconExpand size={14} color="#FFFFFF" />
          </Link>
          <Link href="?" prefetch={false} aria-label="Finalizar llamada"
            style={{ background: color.danger, borderRadius: 6, padding: "3px 8px", display: "inline-flex", alignItems: "center" }}>
            <IconEndCall size={14} color="#FFFFFF" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function ControlsBar({ subs, compact }: { subs: SubsMode; compact?: boolean }): React.JSX.Element {
  const bar: CSSProperties = {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: compact ? 8 : space.md,
    padding: compact ? `10px ${space.sm}px` : `${space.md}px ${space.lg}px`,
    background: "rgba(11, 15, 25, 0.92)",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    flexWrap: "wrap",
  };
  const size = compact ? 40 : 46;
  const btn: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "#FFFFFF",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
  const btnActive: CSSProperties = { ...btn, background: color.spablaCyan, color: color.spablaNavy };
  const endSize = compact ? 52 : 56;
  return (
    <div style={bar}>
      <button type="button" aria-label="Silenciar micrófono" style={btn}><IconMic size={compact ? 16 : 18} color="#FFFFFF" /></button>
      <button type="button" aria-label="Detener cámara" style={btn}><IconVideo size={compact ? 16 : 18} color="#FFFFFF" /></button>
      <button type="button" aria-label="Cambiar altavoz" style={btn}><IconSpeaker size={compact ? 16 : 18} color="#FFFFFF" /></button>
      <Link
        href={subs === "on" ? "?call=video&subs=off" : "?call=video&subs=on"}
        aria-label={subs === "on" ? "Ocultar subtítulos" : "Mostrar subtítulos"}
        aria-pressed={subs === "on"}
        prefetch={false}
        style={subs === "on" ? btnActive : btn}
      >
        <IconCaptions size={compact ? 16 : 18} color={subs === "on" ? color.spablaNavy : "#FFFFFF"} />
      </Link>
      <Link href="?call=video-min" prefetch={false} aria-label="Minimizar videollamada" style={btn}>
        <IconMinimize size={compact ? 16 : 18} color="#FFFFFF" />
      </Link>
      <Link href="?" prefetch={false} aria-label="Finalizar videollamada"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: endSize, height: endSize, borderRadius: "50%",
          background: color.danger, color: "#FFFFFF",
          textDecoration: "none",
          boxShadow: "0 6px 16px rgba(239, 68, 68, 0.35)",
        }}>
        <IconEndCall size={compact ? 20 : 22} color="#FFFFFF" />
      </Link>
    </div>
  );
}

function SubtitlesLayer({ compact }: { compact?: boolean }): React.JSX.Element {
  const wrap: CSSProperties = {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 12,
    margin: "0 auto",
    maxWidth: 640,
    background: "rgba(11, 15, 25, 0.78)",
    color: "#FFFFFF",
    padding: compact ? "6px 10px" : "8px 12px",
    borderRadius: 10,
    backdropFilter: "blur(6px)",
    fontFamily: font.family,
    zIndex: 4,
    boxSizing: "border-box",
    maxHeight: compact ? 96 : 108,
    overflow: "hidden",
  };
  return (
    <div style={wrap} aria-live="polite" aria-label="Subtítulos de la videollamada">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{
          padding: "1px 7px", borderRadius: 999,
          background: color.spablaCoral,
          color: color.spablaNavy,
          fontSize: 10, fontWeight: font.weight.bold,
          letterSpacing: "0.02em",
        }}>Takashi</span>
      </div>
      <div style={{
        fontSize: compact ? font.size.sm : font.size.base,
        lineHeight: 1.3,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        Me alegra mucho verte. ¿Cómo estás?
      </div>
      <div style={{
        fontSize: 11,
        opacity: 0.75,
        marginTop: 2,
        display: "-webkit-box",
        WebkitLineClamp: 1,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        <span style={{ fontFamily: font.jp }} lang="ja">会えてとても嬉しいです。お元気ですか？</span>
      </div>
    </div>
  );
}

/**
 * Illustrative remote-side scene. The design does NOT ship any
 * real portrait — an SVG friendly gradient with a stylised
 * silhouette communicates "video is on" without inventing a fake
 * person. Placeholder chip on top labels this clearly.
 */
function RemoteScene({ mini = false }: { mini?: boolean }): React.JSX.Element {
  const wrap: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(160deg, #0B4B8A 0%, #0E9DD3 62%, #1EC7FF 100%)",
    overflow: "hidden",
  };
  return (
    <div style={wrap}>
      <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" width="100%" height="100%"
           style={{ display: "block" }} role="img" aria-label="Vídeo del interlocutor (ilustración)">
        <defs>
          <radialGradient id="rimlight" cx="60%" cy="35%" r="55%">
            <stop offset="0" stopColor="#FDE68A" stopOpacity="0.3" />
            <stop offset="1" stopColor="#0B0F19" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F8B989" />
            <stop offset="1" stopColor="#B96A3B" />
          </linearGradient>
          <linearGradient id="shirt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1E293B" />
            <stop offset="1" stopColor="#0F172A" />
          </linearGradient>
        </defs>
        <rect width="800" height="500" fill="url(#rimlight)" />
        {/* Torso */}
        <path d="M180 500 C 200 380 300 340 400 340 C 500 340 600 380 620 500 Z" fill="url(#shirt)" />
        {/* Neck */}
        <rect x="360" y="300" width="80" height="60" fill="url(#skin)" opacity="0.9" rx="10" />
        {/* Head */}
        <ellipse cx="400" cy="220" rx="90" ry="110" fill="url(#skin)" />
        {/* Hair */}
        <path d="M310 170 C 320 100 480 100 490 170 C 500 200 460 175 400 180 C 340 175 300 200 310 170 Z" fill="#1F2937" />
        {/* Simplified smile line */}
        <path d="M370 260 Q 400 275 430 260" stroke="#7C2D12" strokeWidth="4" fill="none" strokeLinecap="round" />
        {/* Eyes */}
        <ellipse cx="370" cy="225" rx="6" ry="7" fill="#111827" />
        <ellipse cx="430" cy="225" rx="6" ry="7" fill="#111827" />
        {!mini ? (
          <>
            <rect x="60" y="100" width="120" height="150" rx="6" fill="rgba(255,255,255,0.06)" />
            <rect x="640" y="80" width="120" height="180" rx="6" fill="rgba(255,255,255,0.06)" />
          </>
        ) : null}
      </svg>
    </div>
  );
}

function SelfPip({ compact }: { compact?: boolean }): React.JSX.Element {
  const wrap: CSSProperties = {
    position: "absolute",
    top: 10,
    right: 10,
    width: compact ? 82 : 132,
    borderRadius: 10,
    overflow: "hidden",
    border: "2px solid rgba(255,255,255,0.7)",
    boxShadow: "0 6px 12px rgba(11, 15, 25, 0.35)",
    zIndex: 5,
  };
  const stage: CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio: "3 / 4",
    background: "linear-gradient(180deg, #ffe4c4 0%, #e2c19f 100%)",
  };
  return (
    <div style={wrap} role="img" aria-label={`Vista propia de ${LAURA.displayName}`}>
      <div style={stage}>
        <svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
          <defs>
            <linearGradient id="pipskin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FDE1C7" />
              <stop offset="1" stopColor="#E7B18C" />
            </linearGradient>
          </defs>
          <path d="M0 400 C 20 300 100 260 150 260 C 200 260 280 300 300 400 Z" fill="#1EC7FF" />
          <ellipse cx="150" cy="180" rx="72" ry="88" fill="url(#pipskin)" />
          <path d="M78 140 C 100 80 200 80 222 140 C 210 170 190 150 150 155 C 110 150 90 170 78 140 Z" fill="#3F2A1F" />
          <ellipse cx="128" cy="185" rx="5" ry="6" fill="#111827" />
          <ellipse cx="172" cy="185" rx="5" ry="6" fill="#111827" />
          <path d="M124 215 Q 150 228 176 215" stroke="#7C2D12" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
        <span style={{
          position: "absolute", left: 4, bottom: 4,
          background: "rgba(11,15,25,0.55)", color: "#FFFFFF",
          padding: "1px 6px", borderRadius: 999,
          fontFamily: font.family, fontSize: 10, fontWeight: font.weight.semibold,
        }}>Tú</span>
      </div>
    </div>
  );
}
