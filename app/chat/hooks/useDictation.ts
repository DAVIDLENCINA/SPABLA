"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { CallStatus } from "./useCallSignaling";

export function useDictation(
  callStatus: CallStatus,
  lang: string,
  onTranscript: (text: string) => void
) {
  const [isSupported] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !!(
      (window as any).SpeechRecognition ??
      (window as any).webkitSpeechRecognition
    );
  });

  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Always-current callback — avoids stale closures without restarting recognition
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; });

  const stopDictation = useCallback(() => {
    setIsDictating(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const startDictation = useCallback(() => {
    if (callStatus !== "idle") return;
    if (recognitionRef.current) return;

    const SR =
      (window as any).SpeechRecognition ??
      (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang            = lang;
    recognition.continuous      = false;
    recognition.interimResults  = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const result = event.results[0];
      if (!result?.isFinal) return;
      const text = (result[0]?.transcript ?? "").trim();
      if (text) onTranscriptRef.current(text);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech") {
        console.warn("[DICTATION] error:", event.error);
      }
      stopDictation();
    };

    recognition.onend = () => {
      setIsDictating(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsDictating(true);
  }, [callStatus, lang, stopDictation]);

  // Firewall: stop immediately when call leaves idle state
  useEffect(() => {
    if (callStatus !== "idle") stopDictation();
  }, [callStatus, stopDictation]);

  // Cleanup on unmount
  useEffect(() => () => stopDictation(), [stopDictation]);

  return { isDictating, isSupported, startDictation, stopDictation };
}
