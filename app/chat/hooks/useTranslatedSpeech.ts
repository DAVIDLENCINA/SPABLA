import { useCallback, useRef } from "react";

// BCP-47 codes for SpeechSynthesisUtterance.lang
const LANG_BCP47: Record<string, string> = {
  es: "es-ES", en: "en-US", fr: "fr-FR", de: "de-DE",
  it: "it-IT", pt: "pt-BR", ja: "ja-JP", zh: "zh-CN",
  ar: "ar-SA", ru: "ru-RU",
};

export function useTranslatedSpeech() {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  if (typeof window !== "undefined" && !supported) {
    console.warn("[TTS] Web Speech API not available — voice output disabled");
  }

  // Holds the next utterance to play once the current one ends.
  // Overwritten on each new speak() call while busy — only the latest matters.
  const pendingRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback(
    (text: string, lang: string) => {
      if (!supported || !text.trim()) return;

      const bcp47   = LANG_BCP47[lang] ?? lang;
      const voices  = window.speechSynthesis.getVoices();
      const speaking = window.speechSynthesis.speaking;
      const pending  = window.speechSynthesis.pending;

      console.log("[TTS] speak requested | lang:", bcp47, "| text:", text.substring(0, 40));
      console.log("[TTS] speechSynthesis available:", !!window.speechSynthesis);
      console.log("[TTS] voices count:", voices.length);
      console.log("[TTS] speaking before:", speaking, "| pending before:", pending);

      const u = new SpeechSynthesisUtterance(text);
      u.lang   = bcp47;
      u.rate   = 1.0;
      u.volume = 1.0;
      u.onstart = () => console.log("[TTS] utterance start | lang:", bcp47);
      u.onend = () => {
        console.log("[TTS] utterance end");
        const next = pendingRef.current;
        pendingRef.current = null;
        if (next) window.speechSynthesis.speak(next);
      };
      u.onerror = (e: SpeechSynthesisErrorEvent) => {
        // "canceled" is expected when cancel() is called intentionally (hang-up, toggle off).
        // Don't warn for it, but still drain the queue so we don't get stuck.
        if (e.error !== "canceled") console.warn("[TTS] utterance error:", e.error);
        const next = pendingRef.current;
        pendingRef.current = null;
        if (next) window.speechSynthesis.speak(next);
      };

      if (speaking || pending) {
        // Engine is busy — queue this utterance, discarding any previous pending one.
        // The current utterance's onend/onerror will drain the queue when it finishes.
        pendingRef.current = u;
      } else {
        window.speechSynthesis.speak(u);
      }
    },
    [supported],
  );

  const cancel = useCallback(() => {
    if (supported) {
      pendingRef.current = null;
      window.speechSynthesis.cancel();
    }
  }, [supported]);

  return { speak, cancel, supported };
}
