import { NextRequest, NextResponse } from "next/server";

const LANG_NAMES: Record<string, string> = {
  es: "Spanish", en: "English", fr: "French", de: "German",
  it: "Italian", pt: "Portuguese", ja: "Japanese", zh: "Chinese",
  ar: "Arabic",  ru: "Russian",
};

export async function POST(req: NextRequest) {
  try {
    const { text, from, to } = await req.json();

    if (!text?.trim() || from === to) {
      return NextResponse.json({ translation: text });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[TRANSLATE] OPENAI_API_KEY no configurada");
      return NextResponse.json({ translation: text });
    }

    const sourceLang = LANG_NAMES[from] ?? from;
    const targetLang = LANG_NAMES[to] ?? to;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 500,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `You are a translator. Translate the user's message from ${sourceLang} to ${targetLang}. Return only the translated text, nothing else.`,
          },
          {
            role: "user",
            content: text,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[TRANSLATE] OpenAI error:", res.status, err);
      return NextResponse.json({ translation: text });
    }

    const data = await res.json();
    const translation = data?.choices?.[0]?.message?.content?.trim() ?? text;

    return NextResponse.json({ translation });

  } catch (err) {
    console.error("[TRANSLATE] Error inesperado:", err);
    return NextResponse.json({ translation: "" });
  }
}
