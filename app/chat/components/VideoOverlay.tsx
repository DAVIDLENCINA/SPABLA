"use client";

import { useEffect, useRef } from "react";
import { WebRTCState } from "../hooks/useWebRTC";
import { spablaTrace, traceVideoElement } from "../debug/spablaTrace";

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
      spablaTrace("VIDEO_LOCAL_SRC_SET", { streamId: webrtc.localStream.id, videoAttrs: traceVideoElement(localVideoRef.current) });
      spablaTrace("VIDEO_LOCAL_PLAY_REQUEST", { from: "useEffect-localStream" });
      localVideoRef.current.play().then(
        () => spablaTrace("VIDEO_LOCAL_PLAY_SUCCESS", { videoAttrs: traceVideoElement(localVideoRef.current) }),
        (err: any) => spablaTrace("VIDEO_LOCAL_PLAY_ERROR", { errorName: err?.name ?? null, errorMessage: err?.message ?? String(err) }),
      ).catch(() => {});
    }
  }, [webrtc.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && webrtc.remoteStream) {
      remoteVideoRef.current.srcObject = webrtc.remoteStream;
      spablaTrace("VIDEO_REMOTE_SRC_SET", { streamId: webrtc.remoteStream.id, videoAttrs: traceVideoElement(remoteVideoRef.current) });
      spablaTrace("VIDEO_REMOTE_PLAY_REQUEST", { from: "useEffect-remoteStream" });
      remoteVideoRef.current.play().then(
        () => spablaTrace("VIDEO_REMOTE_PLAY_SUCCESS", { videoAttrs: traceVideoElement(remoteVideoRef.current) }),
        (err: any) => spablaTrace("VIDEO_REMOTE_PLAY_ERROR", { errorName: err?.name ?? null, errorMessage: err?.message ?? String(err) }),
      ).catch(() => {});
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
    spablaTrace("VIDEO_REMOTE_UNLOCK_ATTEMPT", { videoAttrsBefore: traceVideoElement(v), hasRemoteStream: !!webrtc.remoteStream });
    const empty = new MediaStream();
    v.srcObject = empty;
    v.play().catch(() => {});
    v.srcObject = webrtc.remoteStream;
    if (webrtc.remoteStream) {
      v.play().then(
        () => spablaTrace("VIDEO_REMOTE_PLAY_SUCCESS", { from: "unlockRemote", videoAttrs: traceVideoElement(v) }),
        (err: any) => spablaTrace("VIDEO_REMOTE_PLAY_ERROR", { from: "unlockRemote", errorName: err?.name ?? null, errorMessage: err?.message ?? String(err) }),
      ).catch(() => {});
    }
    unlockedRef.current = true;
  }

  // Three-layer stacking (only while VideoOverlay is mounted = videoActive):
  //   z-index 1 — remote video container (background)
  //   z-index 2 — .msg bubbles (above camera)
  //   z-index 3 — local pip (above everything)
  //
  // Extra bubble styles during video call:
  //   .msg p              → font-size 13px (≈ −15 % from 15px)
  //   .msg > div > div:last-child → padding 9px 13px, backdrop-filter blur(18px)
  const bubbleElevation = (
    <style>{`
      .msg { position: relative; z-index: 2; }
      .msg p { font-size: 13px !important; line-height: 1.45 !important; }
      .msg > div > div:last-child { padding: 9px 13px !important; backdrop-filter: blur(18px) !important; -webkit-backdrop-filter: blur(18px) !important; }
    `}</style>
  );

  // Local pip — fixed in root stacking context at z-index 3, above .msg (z-index 2)
  // iOS Safari: play() called from a useEffect can silently fail; onCanPlay + onLoadedMetadata
  // retries defensively. Tapping the pip is a last-resort user-gesture fallback.
  const retryLocalPlay = () => {
    const v = localVideoRef.current;
    if (!v || !webrtc.localStream) return;
    if (v.srcObject !== webrtc.localStream) v.srcObject = webrtc.localStream;
    spablaTrace("VIDEO_LOCAL_PLAY_REQUEST", { from: "retryLocalPlay", videoAttrs: traceVideoElement(v) });
    v.play().then(
      () => spablaTrace("VIDEO_LOCAL_PLAY_SUCCESS", { from: "retryLocalPlay", videoAttrs: traceVideoElement(v) }),
      (err: any) => spablaTrace("VIDEO_LOCAL_PLAY_ERROR", { from: "retryLocalPlay", errorName: err?.name ?? null, errorMessage: err?.message ?? String(err) }),
    ).catch(() => {});
  };
  const localPip = (
    <video
      ref={localVideoRef}
      autoPlay playsInline muted
      onCanPlay={retryLocalPlay}
      onLoadedMetadata={retryLocalPlay}
      onClick={retryLocalPlay}
      style={{
        position: "fixed",
        bottom: 84, right: 12,
        width: 60, height: 82,
        objectFit: "cover",
        borderRadius: 10,
        border: "1.5px solid rgba(0,212,255,.6)",
        zIndex: 3,
      }}
    />
  );

  // Remote video style: darkened + slight blur so text reads first
  const remoteStyle: React.CSSProperties = {
    position: "absolute", inset: 0,
    width: "100%", height: "100%",
    objectFit: "cover",
    opacity: webrtc.hasRemote ? 1 : 0,
    filter: "brightness(0.80)",
  };

  if (expanded) {
    // ── Fullscreen: cubre toda la pantalla ──
    return (
      <>
        {bubbleElevation}
        <div
          onClick={unlockRemote}
          style={{ position: "fixed", inset: 0, zIndex: 1, background: "#000", overflow: "hidden" }}
        >
          <video ref={remoteVideoRef} autoPlay playsInline muted={false} style={remoteStyle} />
          <div
            onClick={e => { e.stopPropagation(); onToggleExpand(); }}
            style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,.55)", borderRadius: 8, padding: 7, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", cursor: "pointer", zIndex: 20 }}
          >
            <ContractIcon />
          </div>
        </div>
        {localPip}
      </>
    );
  }

  // ── Modo por defecto: vídeo remoto como fondo del área de conversación ──
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
          overflow: "hidden",
        }}
      >
        <video ref={remoteVideoRef} autoPlay playsInline muted={false} style={remoteStyle} />
        <div
          onClick={e => { e.stopPropagation(); onToggleExpand(); }}
          style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,.55)", borderRadius: 8, padding: 7, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", cursor: "pointer", zIndex: 20 }}
        >
          <ExpandIcon />
        </div>
      </div>
      {localPip}
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
