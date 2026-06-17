"use client";

import type { Caption } from "../hooks/useWebRTC";

type Props = {
  localCaption: Caption | null;
};

export default function VoiceCaptionsOverlay({ localCaption }: Props) {
  if (!localCaption?.partial) return null;

  return (
    <div style={{
      position:      "absolute",
      bottom:        "max(80px, calc(68px + env(safe-area-inset-bottom, 0px)))",
      left:          16,
      right:         16,
      zIndex:        50,
      pointerEvents: "none",
    }}>
      <p style={{
        color:      "rgba(255,255,255,0.42)",
        fontSize:   13,
        fontStyle:  "italic",
        margin:     0,
        lineHeight: 1.4,
        textShadow: "0 1px 8px rgba(0,0,0,0.95)",
      }}>
        {localCaption.text}…
      </p>
    </div>
  );
}
