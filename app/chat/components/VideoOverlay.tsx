"use client";

import { useEffect, useRef } from "react";
import { WebRTCState } from "../hooks/useWebRTC";

type Props = {
  webrtc: WebRTCState;
  onClose: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
};

export default function VideoOverlay({ webrtc, expanded, onToggleExpand }: Props) {
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const unlockedRef    = useRef(false);

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

  // Reasignar streams al cambiar modo (los elementos <video> se recrean)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    unlockedRef.current = false;
    if (localVideoRef.current && webrtc.localStream) {
      localVideoRef.current.srcObject = webrtc.localStream;
      localVideoRef.current.play().catch(() => {});
    }
    if (remoteVideoRef.current && webrtc.remoteStream) {
      remoteVideoRef.current.srcObject = webrtc.remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [expanded]);

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

  // Elevation rule: bubbles (.msg) above the video overlay.
  // The overlay sits at z-index 1; injecting position+z-index on .msg
  // creates a stacking context that paints bubbles in front of the camera.
  const bubbleElevation = <style>{`.msg { position: relative; z-index: 2; }`}</style>;

  if (expanded) {
    // ── Modo expandido: área de mensajes como fondo de vídeo ──
    return (
      <>
        {bubbleElevation}
        <div
          onClick={unlockRemote}
          style={{
            position: "fixed",
            top: "calc(max(14px, env(safe-area-inset-top, 14px)) + 140px)",
            bottom: 72, left: 0, right: 0,
            zIndex: 1,
            background: "#000",
          }}
        >
          <video ref={remoteVideoRef} autoPlay playsInline muted={false}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: webrtc.hasRemote ? 1 : 0 }}
          />
          <video ref={localVideoRef} autoPlay playsInline muted
            style={{ position: "absolute", top: 10, right: 10, width: 80, height: 110, objectFit: "cover", borderRadius: 12, border: "1.5px solid rgba(0,212,255,.6)", zIndex: 10 }}
          />
          {/* Contraer */}
          <div
            onClick={e => { e.stopPropagation(); onToggleExpand(); }}
            style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,.55)", borderRadius: 8, padding: 7, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", cursor: "pointer", zIndex: 20 }}
          >
            <ContractIcon />
          </div>
        </div>
      </>
    );
  }

  // ── Modo compacto: miniatura fija arriba-derecha, detrás de burbujas ──
  return (
    <>
      {bubbleElevation}
      <div
        onClick={unlockRemote}
        style={{
          position: "fixed",
          top: "calc(max(14px, env(safe-area-inset-top, 14px)) + 140px)",
          right: 12,
          width: 160,
          zIndex: 1,
          borderRadius: 16, overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,.7)",
          border: "1.5px solid rgba(255,255,255,.15)",
          cursor: "pointer",
        }}
      >
        <div onClick={onToggleExpand} style={{ position: "relative", width: "100%", aspectRatio: "4/3", background: "#111" }}>
          <video ref={remoteVideoRef} autoPlay playsInline muted={false}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: webrtc.hasRemote ? 1 : 0 }}
          />
          {/* Vídeo local (pip) */}
          <video ref={localVideoRef} autoPlay playsInline muted
            style={{ position: "absolute", bottom: 5, right: 5, width: 44, height: 60, objectFit: "cover", borderRadius: 7, border: "1px solid rgba(0,212,255,.5)", zIndex: 5 }}
          />
          {/* Botón expandir */}
          <div style={{ position: "absolute", top: 7, left: 7, background: "rgba(0,0,0,.55)", borderRadius: 7, padding: 5, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex" }}>
            <ExpandIcon />
          </div>
        </div>
      </div>
    </>
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

function ContractIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
      <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
    </svg>
  );
}
