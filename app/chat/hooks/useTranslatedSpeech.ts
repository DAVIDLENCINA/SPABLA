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

  // Own state — never trust window.speechSynthesis.speaking (can get stuck as true).
  const isSpeakingRef       = useRef(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const pendingRef          = useRef<SpeechSynthesisUtterance | null>(null);

  const drain = useCallback(() => {
    const next = pendingRef.current;
    pendingRef.current = null;
    if (!next) return;
    isSpeakingRef.current       = true;
    currentUtteranceRef.current = next;
    window.speechSynthesis.speak(next);
  }, []);

  const speak = useCallback(
    (text: string, lang: string) => {
      if (!supported || !text.trim()) return;

      const bcp47  = LANG_BCP47[lang] ?? lang;
      const voices = window.speechSynthesis.getVoices();

      console.log("[TTS] speak requested | lang:", bcp47, "| text:", text.substring(0, 40));
      console.log("[TTS] speechSynthesis available:", !!window.speechSynthesis);
      console.log("[TTS] voices count:", voices.length);
      console.log("[TTS] isSpeaking (own ref):", isSpeakingRef.current, "| browser speaking:", window.speechSynthesis.speaking);

      const u = new SpeechSynthesisUtterance(text);
      u.lang   = bcp47;
      u.rate   = 1.0;
      u.volume = 1.0;
      u.onstart = () => console.log("[TTS] utterance start | lang:", bcp47);
      u.onend = () => {
        console.log("[TTS] utterance end");
        isSpeakingRef.current       = false;
        currentUtteranceRef.current = null;
        drain();
      };
      u.onerror = (e: SpeechSynthesisErrorEvent) => {
        if (e.error !== "canceled") console.warn("[TTS] utterance error:", e.error);
        isSpeakingRef.current       = false;
        currentUtteranceRef.current = null;
        drain();
      };

      if (isSpeakingRef.current) {
        // Engine busy (by our own tracking) — queue latest, discard previous pending.
        pendingRef.current = u;
      } else {
        isSpeakingRef.current       = true;
        currentUtteranceRef.current = u;
        window.speechSynthesis.speak(u);
      }
    },
    [supported, drain],
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    isSpeakingRef.current       = false;
    currentUtteranceRef.current = null;
    pendingRef.current          = null;
    window.speechSynthesis.cancel();
  }, [supported]);

  return { speak, cancel, supported };
}
