import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

let audioUnlocked = false;
let audioCtx: AudioContext | null = null;

// B1: scheduling head for streaming translated audio chunks (gpt-realtime-mini PCM @ 24kHz).
// Shared module-level so consecutive chunks queue back-to-back without gaps.
let translatedPlayHead = 0;
const TRANSLATED_RATE = 24000;

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Copy into a fresh ArrayBuffer to guarantee 2-byte alignment for Int16Array.
  const aligned = new Uint8Array(bytes.byteLength);
  aligned.set(bytes);
  return new Int16Array(aligned.buffer);
}

// B1: schedule a base64-encoded PCM16 chunk @ 24kHz mono for immediate playback.
// Uses the same module-level AudioContext as speak() — must have been unlocked via
// unlockAudio() inside a user gesture before this is called (iOS Safari requirement).
export function playTranslatedPcmChunk(base64: string): void {
  if (typeof window === "undefined" || !base64) return;
  if (!audioCtx) {
    const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    audioCtx = new AudioCtx();
  }
  audioCtx.resume().catch(() => {});
  const int16 = base64ToInt16(base64);
  if (int16.length === 0) return;
  const float = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
  const buffer = audioCtx.createBuffer(1, float.length, TRANSLATED_RATE);
  buffer.getChannelData(0).set(float);
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  if (translatedPlayHead < now + 0.02) translatedPlayHead = now + 0.02;
  src.start(translatedPlayHead);
  translatedPlayHead += buffer.duration;
}

export function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  console.log("[TRACE-TTS-1] unlockAudio() called | audioCtx state:", audioCtx?.state ?? "null");

  // Technique 1: HTMLAudioElement
  const htmlAudio = new Audio();
  htmlAudio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  htmlAudio.play()
    .then(() => console.log("[TTS] html audio unlock ok"))
    .catch((err) => console.log("[TTS] html audio unlock fail:", err?.message ?? err));

  console.log("[TRACE-TTS-2] htmlAudio.play() dispatched — creating AudioContext now");

  // Technique 2: AudioContext — stored globally so speak() can reuse it
  try {
    const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
      audioCtx.resume().then(() => {
        const buffer = audioCtx!.createBuffer(1, 1, 22050);
        const source = audioCtx!.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx!.destination);
        source.start(0);
        console.log("[TTS] audio context unlock ok");
      }).catch((err) => console.log("[TTS] audio context unlock fail:", err?.message ?? err));
    }
  } catch (err: any) {
    console.log("[TTS] audio context unlock fail:", err?.message ?? err);
  }
}

export function useTranslatedSpeech() {
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  // Incremented on every cancel() — lets in-flight speak() calls detect stale requests.
  const generationRef = useRef(0);
  // True while TTS audio is actually playing — used by useWebRTC to gate audio-chunk sends.
  const isSpeakingRef = useRef(false);
  // Failsafe: clears isSpeakingRef after 30 s in case onended never fires.
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speak = useCallback(async (text: string, lang: string) => {
    if (typeof window === "undefined" || !text.trim()) return;

    // Reset speaking state before starting a new utterance (clears previous if any).
    isSpeakingRef.current = false;
    if (speakingTimeoutRef.current) { clearTimeout(speakingTimeoutRef.current); speakingTimeoutRef.current = null; }

    const myGen = generationRef.current;
    console.log("[TRACE-TTS-3] speak() entered | lang:", lang, "| audioUnlocked:", audioUnlocked, "| audioCtx state:", audioCtx?.state ?? "null", "| text:", text.substring(0, 40));
    console.log("[TTS] speak requested | lang:", lang, "| text:", text.substring(0, 40));
    console.log("[TTS] audioUnlocked:", audioUnlocked);

    // Stop whatever is playing right now before fetching new audio.
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {}
      currentSourceRef.current = null;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Guard 1 — cancel() may have been called while awaiting getSession()
      if (generationRef.current !== myGen) { console.log("[TTS] cancelled before fetch"); return; }

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ text: text.trim(), lang }),
      });

      // Guard 2 — cancel() may have been called while awaiting fetch
      if (generationRef.current !== myGen) { console.log("[TTS] cancelled after fetch"); return; }

      if (!res.ok) {
        console.warn("[TTS] /api/tts error:", res.status);
        return;
      }

      const arrayBuffer = await res.arrayBuffer();

      // Guard 3 — cancel() may have been called while awaiting arrayBuffer
      if (generationRef.current !== myGen) { console.log("[TTS] cancelled after arrayBuffer"); return; }

      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

      if (isIOS) {
        // iOS Safari: Web Audio API required — HTMLAudioElement.play() blocked outside gesture
        if (!audioCtx) {
          const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
          audioCtx = new AudioCtx();
        }
        await audioCtx.resume();

        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        // Guard 4 — cancel() may have been called while decoding
        if (generationRef.current !== myGen) { console.log("[TTS] cancelled after decode"); return; }

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.onended = () => {
          console.log("[TTS] audio ended");
          if (currentSourceRef.current === source) currentSourceRef.current = null;
          isSpeakingRef.current = false;
          if (speakingTimeoutRef.current) { clearTimeout(speakingTimeoutRef.current); speakingTimeoutRef.current = null; }
        };
        currentSourceRef.current = source;

        isSpeakingRef.current = true;
        speakingTimeoutRef.current = setTimeout(() => { isSpeakingRef.current = false; speakingTimeoutRef.current = null; }, 30000);
        console.log("[TTS] calling source.start()");
        source.start();
        console.log("[TTS] source.start() called");
      } else {
        // Desktop: HTMLAudioElement — direct and reliable, no AudioContext needed
        const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const htmlAudio = new Audio(url);
        htmlAudio.onended = () => {
          console.log("[TTS] htmlAudio ended");
          URL.revokeObjectURL(url);
          isSpeakingRef.current = false;
          if (speakingTimeoutRef.current) { clearTimeout(speakingTimeoutRef.current); speakingTimeoutRef.current = null; }
        };
        isSpeakingRef.current = true;
        speakingTimeoutRef.current = setTimeout(() => { isSpeakingRef.current = false; speakingTimeoutRef.current = null; }, 30000);
        console.log("[TTS] calling htmlAudio.play()");
        await htmlAudio.play();
        console.log("[TTS] htmlAudio.play() resolved");
      }
    } catch (err: any) {
      console.warn("[TTS] speak error:", err?.name, err?.message ?? err);
    }
  }, []);

  const cancel = useCallback(() => {
    generationRef.current += 1; // invalidates all in-flight speak() calls
    isSpeakingRef.current = false;
    if (speakingTimeoutRef.current) { clearTimeout(speakingTimeoutRef.current); speakingTimeoutRef.current = null; }
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {}
      currentSourceRef.current = null;
    }
  }, []);

  return { speak, cancel, isSpeakingRef, supported: true };
}
