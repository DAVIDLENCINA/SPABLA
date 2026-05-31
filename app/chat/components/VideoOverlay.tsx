"use client";

import { useEffect, useRef } from "react";
import { WebRTCState } from "../hooks/useWebRTC";

type Props = {
  webrtc: WebRTCState;
  onClose: () => void;
  onMinimize: () => void;   // hides overlay without ending the call
  expanded: boolean;
  onToggleExpand: () => void;
};

export default function VideoOverlay({ webrtc, onClose, onMinimize, expanded, onToggleExpand }: Props) {
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const unlockedRef    = useRef(false);

  // Asignar streams a los elementos <video>
  useEffect(() => {
    if (localVideoRef.current && webrtc.localStream) {
      localVideoRef.current.srcObject = webrtc.localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [webrtc.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && webrtc.remoteStream) {
      remoteVideoRef.current.srcObject = webrtc.remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [webrtc.remoteStream]);

  // Safari iOS: desbloquear vídeo remoto en primer toque
  function unlockRemote() {
    if (unlockedRef.current || !remoteVideoRef.current) return;
    const v = remoteVideoRef.current;
    const empty = new MediaStream();
    v.srcObject = empty;
    v.play().catch(() => {});
    v.srcObject = webrtc.remoteStream;
    if (webrtc.remoteStream) v.play().catch(() => {});
    unlockedRef.current = true;
  }

  if (expanded) {
    // ── Modo inmersivo: pantalla completa ──
    return (
      <div
        onClick={unlockRemote}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000" }}
      >
        <video ref={remoteVideoRef} autoPlay playsInline muted={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: webrtc.hasRemote ? 1 : 0 }}
        />
        <video ref={localVideoRef} autoPlay playsInline muted
          style={{ position: "absolute", top: 16, right: 16, width: 100, height: 140, objectFit: "cover", borderRadius: 16, border: "2px solid rgba(0,212,255,.75)", zIndex: 10 }}
        />

        {/* Gradient */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.3) 0%, transparent 30%, rgba(0,0,0,.7) 80%)", pointerEvents: "none" }}/>

        {!webrtc.hasRemote && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: "#fff", fontSize: 22, fontWeight: 700 }}>Esperando participante…</p>
          </div>
        )}

        {/* Subtítulos — modo inmersivo */}
        {(webrtc.remoteCaption || webrtc.localCaption) && (
          <div style={{ position: "absolute", bottom: 130, left: 0, right: 0, zIndex: 15, padding: "0 28px", display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
            {webrtc.remoteCaption && (
              <div style={{ background: "rgba(0,0,0,.62)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: 12, padding: "10px 16px", opacity: webrtc.remoteCaption.partial ? 0.65 : 1 }}>
                <p style={{ color: "#fff", fontSize: "clamp(16px,4vw,26px)", fontWeight: 600, lineHeight: 1.35, margin: 0, textShadow: "0 1px 8px rgba(0,0,0,.8)" }}>
                  {webrtc.remoteCaption.text}
                </p>
                {webrtc.remoteCaption.original !== webrtc.remoteCaption.text && (
                  <p style={{ color: "rgba(255,255,255,.42)", fontSize: 13, margin: "4px 0 0", fontStyle: "italic" }}>
                    {webrtc.remoteCaption.original}
                  </p>
                )}
              </div>
            )}
            {webrtc.localCaption && (
              <p style={{ color: "rgba(255,255,255,.52)", fontSize: "clamp(13px,3vw,17px)", fontStyle: "italic", margin: 0, paddingLeft: 4, opacity: webrtc.localCaption.partial ? 0.5 : 0.68 }}>
                {webrtc.localCaption.text}
              </p>
            )}
          </div>
        )}

        {/* Controles */}
        <div style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 20, zIndex: 20 }}>
          <CtrlBtn onClick={webrtc.toggleMic} danger={!webrtc.micOn}>
            <MicIcon on={webrtc.micOn} />
          </CtrlBtn>
          <CtrlBtn onClick={webrtc.toggleCam} danger={!webrtc.camOn}>
            <CamIcon on={webrtc.camOn} />
          </CtrlBtn>
          {/* Colgar */}
          <button onClick={() => { webrtc.endCall(); onClose(); }} style={{ width: 68, height: 68, borderRadius: "50%", background: "radial-gradient(circle at 38% 35%, #ff5569, #e8162e)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <HangUpIcon />
          </button>
          {/* Contraer */}
          <CtrlBtn onClick={onToggleExpand}>
            <ContractIcon />
          </CtrlBtn>
        </div>
      </div>
    );
  }

  // ── Modo compacto: flotante sobre el chat ──
  return (
    <div
      onClick={unlockRemote}
      style={{ position: "fixed", bottom: 80, right: 16, width: 220, zIndex: 100, borderRadius: 20, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,.6)", border: "1.5px solid rgba(255,255,255,.15)" }}
    >
      {/* Vídeo remoto */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", background: "#111" }}>
        <video ref={remoteVideoRef} autoPlay playsInline muted={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", opacity: webrtc.hasRemote ? 1 : 0 }}
        />
        {!webrtc.hasRemote && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: "rgba(255,255,255,.5)", fontSize: 13 }}>Esperando…</p>
          </div>
        )}
        {/* Tu vídeo pequeño */}
        <video ref={localVideoRef} autoPlay playsInline muted
          style={{ position: "absolute", bottom: 8, right: 8, width: 56, height: 76, objectFit: "cover", borderRadius: 10, border: "1.5px solid rgba(0,212,255,.6)" }}
        />
      </div>

      {/* Subtítulos — modo compacto */}
      {(webrtc.remoteCaption || webrtc.localCaption) && (
        <div style={{ background: "rgba(0,0,0,.82)", padding: "6px 10px" }}>
          {webrtc.remoteCaption && (
            <p style={{ color: "#fff", fontSize: 12, margin: 0, lineHeight: 1.4, fontWeight: 500, opacity: webrtc.remoteCaption.partial ? 0.6 : 1 }}>
              {webrtc.remoteCaption.text}
            </p>
          )}
          {webrtc.localCaption && (
            <p style={{ color: "rgba(255,255,255,.42)", fontSize: 11, margin: webrtc.remoteCaption ? "3px 0 0" : 0, fontStyle: "italic", opacity: webrtc.localCaption.partial ? 0.5 : 0.65 }}>
              {webrtc.localCaption.text}
            </p>
          )}
        </div>
      )}

      {/* Barra de controles */}
      <div style={{ background: "rgba(13,17,23,.95)", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <SmallBtn onClick={webrtc.toggleMic} danger={!webrtc.micOn}><MicIcon on={webrtc.micOn} size={14}/></SmallBtn>
          <SmallBtn onClick={webrtc.toggleCam} danger={!webrtc.camOn}><CamIcon on={webrtc.camOn} size={14}/></SmallBtn>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <SmallBtn onClick={onToggleExpand}><ExpandIcon /></SmallBtn>
          {/* Minimize: hides the overlay but keeps the call alive */}
          <SmallBtn onClick={onMinimize}><MinimizeIcon /></SmallBtn>
          <SmallBtn onClick={() => { webrtc.endCall(); onClose(); }} danger><HangUpIcon size={14}/></SmallBtn>
        </div>
      </div>
    </div>
  );
}

// ── Botones ──────────────────────────────────────────────────────

function CtrlBtn({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ width: 56, height: 56, borderRadius: "50%", background: danger ? "rgba(255,50,70,.8)" : "rgba(255,255,255,.12)", border: `1.5px solid ${danger ? "rgba(255,60,80,.5)" : "rgba(255,255,255,.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
      {children}
    </button>
  );
}

function SmallBtn({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ width: 32, height: 32, borderRadius: "50%", background: danger ? "rgba(255,50,70,.8)" : "rgba(255,255,255,.1)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
      {children}
    </button>
  );
}

// ── Iconos ───────────────────────────────────────────────────────

function MicIcon({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {on
        ? <><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/></>
        : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 10v-1m14 0v1a7 7 0 01-.11 1.23M12 19v3M9 22h6"/></>}
    </svg>
  );
}

function CamIcon({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {on
        ? <><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/></>
        : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 01-2-2V8m3-3h10l2 3h1a2 2 0 012 2v6.5"/></>}
    </svg>
  );
}

function HangUpIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 0111.82 19a19.5 19.5 0 01-6-6A19.79 19.79 0 013 4.18 2 2 0 015 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  );
}

// Arrow-down: hide overlay, keep call active
function MinimizeIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function ContractIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
      <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
    </svg>
  );
}
