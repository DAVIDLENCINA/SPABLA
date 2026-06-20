import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

// Module-level flag — shared across all hook instances.
// iOS Safari blocks audio.play() from async contexts until the user has
// triggered at least one play() call synchronously inside a user gesture.
let audioUnlocked = false;

// Call this synchronously inside a user gesture handler (e.g. onClick).
// Creates a silent audio element and plays it to unlock HTMLAudioElement on iOS.
export function unlockAudio() {
  if (audioUnlocked) return;
  const audio = new Audio();
  // Minimal valid WAV: 44-byte header + 0 samples = silence
  audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  audio.play()
    .then(() => { audioUnlocked = true; console.log("[TTS] audio unlocked ✓"); })
    .catch((err) => {
      // Mark as attempted regardless — some iOS versions unlock even on failed play().
      audioUnlocked = true;
      console.log("[TTS] audio unlock attempt (may still work):", err?.message ?? err);
    });
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
