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
    const vid = remoteVideoRef.current;
    const stream = webrtc.remoteStream;
    if (!vid || !stream) return;
    const vt = stream.getVideoTracks();
    console.log("[VIDEOOVERLAY] remote srcObject assigned; videoTracks:", vt.length, "readyState:", vt[0]?.readyState ?? "none");
    vid.srcObject = stream;
    console.log("[VIDEOOVERLAY] after srcObject: readyState:", vid.readyState, "videoWidth:", vid.videoWidth, "videoHeight:", vid.videoHeight, "paused:", vid.paused);
    const onLoadedMetadata = () => console.log("[VIDEO] loadedmetadata; videoWidth:", vid.videoWidth, "videoHeight:", vid.videoHeight);
    const onLoadedData     = () => console.log("[VIDEO] loadeddata");
    const onCanPlay        = () => console.log("[VIDEO] canplay");
    const onPlaying        = () => console.log("[VIDEO] playing");
    vid.addEventListener("loadedmetadata", onLoadedMetadata);
    vid.addEventListener("loadeddata",     onLoadedData);
    vid.addEventListener("canplay",        onCanPlay);
    vid.addEventListener("playing",        onPlaying);
    vid.play()
      .then(() => console.log("[VIDEOOVERLAY] remote play() resolved"))
      .catch(err => console.warn("[VIDEOOVERLAY] remote play() rejected:", err?.name, err?.message));
    return () => {
      vid.removeEventListener("loadedmetadata", onLoadedMetadata);
      vid.removeEventListener("loadeddata",     onLoadedData);
      vid.removeEventListener("canplay",        onCanPlay);
      vid.removeEventListener("playing",        onPlaying);
    };
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
      console.log("[VIDEOOVERLAY] expanded reassign; remote videoTracks:", webrtc.remoteStream.getVideoTracks().length);
      remoteVideoRef.current.play()
        .then(() => console.log("[VIDEOOVERLAY] expanded remote play() resolved"))
        .catch(err => console.warn("[VIDEOOVERLAY] expanded remote play() rejected:", err?.name, err?.message));
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
  const localPip = (
    <video
      ref={localVideoRef}
      autoPlay playsInline muted
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
