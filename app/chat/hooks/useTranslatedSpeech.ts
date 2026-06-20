import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

let audioUnlocked = false;

export function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  // Technique 1: HTMLAudioElement
  const htmlAudio = new Audio();
  htmlAudio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  htmlAudio.play()
    .then(() => console.log("[TTS] html audio unlock ok"))
    .catch((err) => console.log("[TTS] html audio unlock fail:", err?.message ?? err));

  // Technique 2: AudioContext (more reliable on iOS 16+)
  try {
    const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      ctx.resume().then(() => {
        const buffer = ctx.createBuffer(1, 1, 22050);
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
  // Incremented on every cancel() — lets in-flight speak() calls detect stale requests.
  const generationRef   = useRef(0);

  const speak = useCallback(async (text: string, lang: string) => {
    if (typeof window === "undefined" || !text.trim()) return;

    const myGen = generationRef.current;
    console.log("[TTS] speak requested | lang:", lang, "| text:", text.substring(0, 40));
    console.log("[TTS] audioUnlocked:", audioUnlocked);

    // Stop whatever is playing right now before fetching new audio.
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current.load();
      currentAudioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
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

      const blob = await res.blob();

      // Guard 3 — cancel() may have been called while awaiting blob
      if (generationRef.current !== myGen) { console.log("[TTS] cancelled after blob"); return; }

      const url = URL.createObjectURL(blob);
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
    generationRef.current += 1; // invalidates all in-flight speak() calls
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current.load();
      currentAudioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
  }, []);

  return { speak, cancel, supported: true };
}
