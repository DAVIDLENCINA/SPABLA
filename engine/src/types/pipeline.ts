/**
 * SPABLA Engine — Pipeline contract (Fase 6).
 *
 * Payload agregado que el `PipelineOrchestrator` publica junto con
 * `pipeline.turn.completed`. Los campos son opcionales para reflejar
 * qué etapas realmente ejecutaron: por ejemplo, un turno texto-sin-TTS
 * no tiene `ttsChunkCount`. Las duraciones se miden con el `Clock`
 * inyectado y viven sólo en el evento — el orchestrator NO retiene el
 * result tras emitirlo.
 */

import type { UUID } from "./ids.js";

/**
 * Fuente del turno: dispara la apertura del `TurnPipeline`.
 *  - `"voice"`: `stt.final` inició el turno (arranque en `transcribing`).
 *  - `"text"`: `message.sent` bilingüe inició el turno (arranque en
 *    `translating`).
 */
export type PipelineTurnTrigger = "voice" | "text";

/**
 * Duraciones parciales del pipeline en milisegundos. `stt` sólo aplica
 * a turnos de voz; `translation` siempre; `tts` sólo si la política del
 * turno incluyó síntesis. `total` mide desde apertura hasta cierre
 * (terminal).
 */
export type PipelineTurnDurations = Readonly<{
  stt?: number;
  translation?: number;
  tts?: number;
  total: number;
}>;

/**
 * Snapshot final del turno visto desde el orchestrator. Consumers de
 * `pipeline.turn.completed` reciben este objeto en el payload.
 */
export type PipelineTurnResult = Readonly<{
  turnId: UUID;
  sourceText: string | undefined;
  translatedText: string | undefined;
  ttsChunkCount: number | undefined;
  ttsTotalBytes: number | undefined;
  durations: PipelineTurnDurations;
}>;
