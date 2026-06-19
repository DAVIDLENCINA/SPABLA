"use client";
import type { DiagReport } from "../hooks/useWebRTC";

function Row({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  const color = ok === null ? "rgba(255,255,255,0.35)"
              : ok          ? "#41ff9d"
              :               "#ff6b7a";
  const icon  = ok === null ? "—" : ok ? "●" : "✕";
  return (
    <div style={{ display: "flex", gap: 6, fontSize: 11, lineHeight: 1.6, fontFamily: "monospace" }}>
      <span style={{ color, minWidth: 12, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: "rgba(255,255,255,0.55)", minWidth: 68, flexShrink: 0 }}>{label}</span>
      {detail && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{detail}</span>}
    </div>
  );
}

function Side({ title, d }: { title: string; d: DiagReport | null }) {
  const stale = !d || (Date.now() - d.ts > 10_000);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase",
        color: "rgba(255,255,255,0.4)", marginBottom: 4,
      }}>
        {title}
        {stale && <span style={{ color: "#ff6b7a", marginLeft: 6 }}>sin datos</span>}
      </div>
      {d && !stale ? (
        <>
          <Row label="Mic"    ok={d.micOk} />
          <Row label="Audio"  ok={d.audioOk} detail={`rms=${d.rms.toFixed(4)}  nz=${d.nonZeroPct}%`} />
          <Row label="STT"    ok={d.partialsRx > 0 || d.finalsRx > 0}
               detail={`p=${d.partialsRx}  f=${d.finalsRx}  chunks=${d.chunksSent}`} />
          <Row label="TTS"    ok={d.ttsCount > 0} detail={d.ttsCount > 0 ? `x${d.ttsCount}` : undefined} />
        </>
      ) : (
        <Row label="esperando…" ok={null} />
      )}
    </div>
  );
}

export default function DiagnosticsPanel({
  localDiag,
  remoteDiag,
}: {
  localDiag:  DiagReport | null;
  remoteDiag: DiagReport | null;
}) {
  return (
    <div style={{
      position:             "fixed",
      bottom:               88,
      left:                 12,
      zIndex:               300,
      background:           "rgba(6,10,20,0.93)",
      border:               "1px solid rgba(255,255,255,0.08)",
      borderRadius:         10,
      padding:              "10px 14px",
      minWidth:             220,
      backdropFilter:       "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      pointerEvents:        "none",
    }}>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
        color: "rgba(62,198,198,0.6)", marginBottom: 8,
      }}>
        DIAGNÓSTICO STT
      </div>
      <Side title="Local (este dispositivo)"  d={localDiag} />
      <Side title="Remoto (otro dispositivo)" d={remoteDiag} />
    </div>
  );
}
