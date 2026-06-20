import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

// Module-level flag — shared across all hook instances.
// iOS Safari blocks audio.play() from async contexts until the user has
// triggered at least one play() call synchronously inside a user gesture.
let audioUnlocked = false;

// Call this synchronously inside a user gesture handler (e.g. onClick).
// Uses two complementary techniques to unlock audio on iOS Safari:
// 1. HTMLAudioElement.play() with a silent WAV
// 2. AudioContext.resume() + silent buffer source (more reliable on iOS 16+)
export function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true; // mark immediately so concurrent calls don't race

  // ── Technique 1: HTMLAudioElement ─────────────────────────────────────────
  const htmlAudio = new Audio();
  htmlAudio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  htmlAudio.play()
    .then(() => console.log("[TTS] html audio unlock ok"))
    .catch((err) => console.log("[TTS] html audio unlock fail:", err?.message ?? err));

  // ── Technique 2: AudioContext ─────────────────────────────────────────────
  try {
    const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      ctx.resume().then(() => {
        const buffer = ctx.createBuffer(1, 1, 22050); // 1 sample of silence
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        console.log("[TTS] audio context unlock ok");
      }).catch((err) => console.log("[TTS] audio context unlock fail:", err?.message ?? err));
    }
  } catch (err: any) {
    console.log("[TTS] audio context unlock fail:", err?.message ?? err);
  }
}

export function useTranslatedSpeech() {
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef   = useRef<string | null>(null);

  const speak = useCallback(async (text: string, lang: string) => {
    if (typeof window === "undefined" || !text.trim()) return;

    console.log("[TTS] speak requested | lang:", lang, "| text:", text.substring(0, 40));
    console.log("[TTS] audioUnlocked:", audioUnlocked);

    // Cancel any audio already playing — prefer latest subtitle over queuing.
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ text: text.trim(), lang }),
      });

      if (!res.ok) {
        console.warn("[TTS] /api/tts error:", res.status);
        return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      currentUrlRef.current = url;

      const audio = new Audio(url);
      currentAudioRef.current = audio;

      audio.onended = () => {
        console.log("[TTS] audio ended");
        URL.revokeObjectURL(url);
        if (currentUrlRef.current === url)    currentUrlRef.current   = null;
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
      };
      audio.onerror = (e) => {
        console.warn("[TTS] audio playback error:", e);
        URL.revokeObjectURL(url);
        if (currentUrlRef.current === url)    currentUrlRef.current   = null;
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
      };

      console.log("[TTS] calling audio.play()");
      await audio.play();
      console.log("[TTS] audio.play() resolved");
    } catch (err: any) {
      console.warn("[TTS] speak error:", err?.name, err?.message ?? err);
    }
  }, []);

  const cancel = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
  }, []);

  return { speak, cancel, supported: true };
}
