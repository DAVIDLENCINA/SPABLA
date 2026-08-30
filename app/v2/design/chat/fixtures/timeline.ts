/**
 * SPABLA · UX-01 · Deterministic timeline fixture.
 *
 * Chronological conversation between Laura (ES · self) and Takashi
 * (JA · peer). All Japanese lines were reviewed for correctness:
 *   · standard polite forms
 *   · no invented / deformed characters
 *   · consistent kana / kanji ratio
 *
 * The timeline is used by the prototype to render every state (text,
 * voice-active, voice-ended, video-active, video-ended). The state
 * machine in `state.ts` layers the call overlays on top of the same
 * list — the reference images already showed both a finished voice
 * call and an active video call cohabiting the conversation.
 */

import type { LangCode } from "./identities";

export type MessageEvent = {
  readonly kind: "message";
  readonly id: string;
  readonly authorId: "self" | "peer";
  readonly time: string;
  readonly deliveredTicks?: boolean;
  readonly translation: {
    readonly language: LangCode;
    readonly text: string;
  };
  readonly original: {
    readonly language: LangCode;
    readonly text: string;
  };
};

export type CallEvent = {
  readonly kind: "call-voice" | "call-video";
  readonly id: string;
  readonly time: string;
  readonly durationLabel: string;
  readonly initiatedBy: "self" | "peer";
  readonly transcriptTeaser: string;
};

export type DayDivider = {
  readonly kind: "day";
  readonly id: string;
  readonly label: string;
};

export type TimelineEvent = MessageEvent | CallEvent | DayDivider;

/**
 * Base timeline that is common to every state (voice call already
 * finished, no active video yet). States that activate a call overlay
 * simply layer an in-progress card on top of this base plus the
 * composer.
 */
export const BASE_TIMELINE: readonly TimelineEvent[] = [
  { kind: "day", id: "day-today", label: "Hoy" },
  {
    kind: "message",
    id: "m1",
    authorId: "peer",
    time: "09:38",
    translation: { language: "es", text: "Hola Laura, ¿cómo estás?" },
    original: { language: "ja", text: "こんにちは、ラウラさん。お元気ですか？" },
  },
  {
    kind: "message",
    id: "m2",
    authorId: "self",
    time: "09:39",
    deliveredTicks: true,
    translation: { language: "ja", text: "こんにちは、タカシさん。元気です、ありがとう。" },
    original: { language: "es", text: "¡Hola, Takashi! Muy bien, gracias 😊" },
  },
  {
    kind: "call-voice",
    id: "c1",
    time: "09:40",
    durationLabel: "4:12",
    initiatedBy: "self",
    transcriptTeaser: "Hablamos del plan para esta noche.",
  },
  {
    kind: "message",
    id: "m3",
    authorId: "peer",
    time: "09:45",
    translation: { language: "es", text: "¿Podemos vernos esta noche en el café?" },
    original: { language: "ja", text: "今夜、カフェで会えますか？" },
  },
  {
    kind: "message",
    id: "m4",
    authorId: "self",
    time: "09:46",
    deliveredTicks: true,
    translation: { language: "ja", text: "もちろん、七時でよろしいですか？" },
    original: { language: "es", text: "Claro, ¿te va bien a las siete?" },
  },
];

/**
 * The video call finalised event added to the timeline when the
 * `video-ended` state is selected.
 */
export const VIDEO_ENDED_EVENT: CallEvent = {
  kind: "call-video",
  id: "c2",
  time: "09:52",
  durationLabel: "5:03",
  initiatedBy: "peer",
  transcriptTeaser: "Confirmamos el punto de encuentro.",
};

/**
 * The voice call finalised event added to the timeline when the
 * `voice-ended` state is selected (in addition to the one already in
 * BASE_TIMELINE).
 */
export const VOICE_JUST_ENDED_EVENT: CallEvent = {
  kind: "call-voice",
  id: "c3",
  time: "09:52",
  durationLabel: "2:47",
  initiatedBy: "self",
  transcriptTeaser: "Cerramos los detalles del café.",
};

/** Live transcript lines used by voice and video overlays. */
export type TranscriptLine = {
  readonly id: string;
  readonly authorId: "self" | "peer";
  readonly time: string;
  readonly translation: { readonly language: LangCode; readonly text: string };
  readonly original: { readonly language: LangCode; readonly text: string };
};

export const LIVE_TRANSCRIPT: readonly TranscriptLine[] = [
  {
    id: "t1",
    authorId: "peer",
    time: "09:47",
    translation: { language: "es", text: "Me alegra mucho verte. ¿Cómo estás?" },
    original: { language: "ja", text: "会えてとても嬉しいです。お元気ですか？" },
  },
  {
    id: "t2",
    authorId: "self",
    time: "09:47",
    translation: { language: "ja", text: "私も嬉しいです。とても元気です、ありがとう。" },
    original: { language: "es", text: "Yo también me alegro. Estoy muy bien, gracias." },
  },
  {
    id: "t3",
    authorId: "peer",
    time: "09:48",
    translation: { language: "es", text: "Entonces nos vemos a las siete en el café." },
    original: { language: "ja", text: "では、七時にカフェで会いましょう。" },
  },
];

/**
 * Deterministic turns used by the Modo Traductor face-to-face view.
 */
export type TranslatorTurn = {
  readonly id: string;
  readonly speaker: "self" | "other";
  readonly source: { readonly language: LangCode; readonly text: string };
  readonly translated: { readonly language: LangCode; readonly text: string };
};

export const TRANSLATOR_HISTORY: readonly TranslatorTurn[] = [
  {
    id: "tr1",
    speaker: "self",
    source: { language: "es", text: "¿Cómo puedo llegar a la estación?" },
    translated: { language: "ja", text: "駅までどうやって行けますか？" },
  },
  {
    id: "tr2",
    speaker: "other",
    source: { language: "ja", text: "まっすぐ進んで、右に曲がってください。" },
    translated: { language: "es", text: "Siga recto y gire a la derecha." },
  },
];
