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

  // Cancela cualquier voz en curso y reproduce text en lang.
  // Sólo se llama con traducciones finales (nunca con subtítulos parciales).
  const speak = useCallback(
    (text: string, lang: string) => {
      if (!supported || !text.trim()) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang   = LANG_BCP47[lang] ?? lang;
      u.rate   = 1.0;
      u.volume = 1.0;
      window.speechSynthesis.speak(u);
      console.log("[TTS] speak:", text.substring(0, 40), "| lang:", u.lang);
    },
    [supported],
  );

  // Para llamar en endCall o al desactivar la voz.
  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { speak, cancel, supported };
}
