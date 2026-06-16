"use client";

import { useEffect, useRef } from "react";
import type { CallStatus } from "./useCallSignaling";

export function useVoiceTranscription(
  callStatus: CallStatus,
  localStream: MediaStream | null,
  lang: string,
  onTranscript: (text: string) => void
) {
  // Ref so recognition.onresult always calls the latest callback without restarting
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SR: any =
      (window as any).SpeechRecognition ??
      (window as any).webkitSpeechRecognition;

    if (!SR) {
      console.warn("[VOICE] SpeechRecognition not supported in this browser");
      return;
    }

    // localStream is used only as a condition: confirms the call is active and the
    // microphone has been granted. SpeechRecognition captures audio independently
    // from the browser's default mic input — it does NOT consume localStream directly.
    if (callStatus !== "accepted" || !localStream) return;

    const recognition: any = new SR();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let lastTranscript = "";
    let alive = true;

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      if (!result?.isFinal) return;
      const text = (result[0].transcript ?? "").trim();
      if (!text || text === lastTranscript) return;
      lastTranscript = text;
      onTranscriptRef.current(text);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") return; // normal silence, ignore
      console.warn("[VOICE] recognition error:", event.error);
    };

    recognition.onend = () => {
      if (alive) recognition.start(); // auto-restart while call is active
    };

    recognition.start();

    return () => {
      alive = false;
      try { recognition.stop(); } catch {}
    };
  }, [callStatus, localStream, lang]);
}
