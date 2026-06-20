import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

export function useTranslatedSpeech() {
  // Tracks the currently playing Audio element so cancel() can stop it.
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef   = useRef<string | null>(null);

  const speak = useCallback(async (text: string, lang: string) => {
    if (typeof window === "undefined" || !text.trim()) return;

    console.log("[TTS] speak requested | lang:", lang, "| text:", text.substring(0, 40));

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
        if (currentUrlRef.current === url)   currentUrlRef.current   = null;
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
      };
      audio.onerror = (e) => {
        console.warn("[TTS] audio playback error:", e);
        URL.revokeObjectURL(url);
        if (currentUrlRef.current === url)   currentUrlRef.current   = null;
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
      };

      console.log("[TTS] playing audio");
      await audio.play();
    } catch (err) {
      console.warn("[TTS] speak error:", err);
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
