import { useCallback } from "react";

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
      u.onend   = () => console.log("[TTS] utterance end");
      u.onerror = (e: SpeechSynthesisErrorEvent) => console.warn("[TTS] utterance error:", e.error);

      if (speaking) {
        // Delay speak slightly after cancel to avoid WebKit race condition
        window.speechSynthesis.cancel();
        setTimeout(() => window.speechSynthesis.speak(u), 80);
      } else {
        window.speechSynthesis.speak(u);
      }
    },
    [supported],
  );

  // Para llamar en endCall o al desactivar la voz.
  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { speak, cancel, supported };
}
