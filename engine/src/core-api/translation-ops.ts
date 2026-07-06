/**
 * SPABLA Core API — Translation companion class.
 *
 * Holds the Translation command orchestration so `SpablaCore` stays under
 * the 300-line cap with thin one-line delegators. External code touches
 * translation ONLY through `SpablaCore.startTranslation / stopTranslation /
 * requestTranslation`; this class is not exported from `index.ts`.
 */

import type { Engine } from "../engine/Engine.js";
import type { TranslationManager } from "../translation/TranslationManager.js";
import type {
  TranslationRequest,
  TranslationSession,
} from "../types/translation.js";
import type { UUID, CorrelationId } from "../types/ids.js";
import { SpablaCoreError } from "./types.js";
import type {
  StartTranslationInput, StartTranslationResult, StopTranslationInput,
  RequestTranslationInput, RequestTranslationResult,
} from "./types.js";

export class TranslationOps {
  constructor(
    private readonly engine: Engine,
    private readonly translation: TranslationManager,
    private readonly newId: () => UUID,
    private readonly correlation: () => CorrelationId,
  ) {}

  start(input: StartTranslationInput): StartTranslationResult {
    const call = this.engine.snapshotCall(input.callId);
    if (!call) throw new SpablaCoreError("unknown-callId", { callId: input.callId });
    if (call.state !== "accepted") {
      throw new SpablaCoreError("call-not-accepted",
        { callId: input.callId, state: call.state });
    }
    const languagePair = input.languagePair ?? call.languagePair;
    const sessionId = this.newId();
    this.translation.createSession(
      { sessionId, callSessionId: input.callId, languagePair },
      this.correlation(),
    );
    return Object.freeze({ sessionId });
  }

  stop(input: StopTranslationInput): void {
    this.requireSession(input.sessionId);
    this.translation.stop(input.sessionId, this.correlation());
  }

  request(input: RequestTranslationInput): RequestTranslationResult {
    this.requireSession(input.sessionId);
    if (typeof input.text !== "string" || input.text.length === 0) {
      throw new SpablaCoreError("empty-text", { sessionId: input.sessionId });
    }
    const req = this.translation.requestTranslation(
      {
        sessionId: input.sessionId,
        text: input.text,
        sourceLanguage: input.sourceLanguage,
        ...(input.sourceTurnId !== undefined ? { sourceTurnId: input.sourceTurnId } : {}),
      },
      this.correlation(),
    );
    return Object.freeze({ requestId: req.id });
  }

  getSession(sessionId: UUID): TranslationSession | undefined {
    return this.translation.getSession(sessionId);
  }
  getRequest(requestId: UUID): TranslationRequest | undefined {
    return this.translation.getRequest(requestId);
  }
  listActive(callId: UUID): ReadonlyArray<TranslationSession> {
    return this.translation.listActiveSessions(callId);
  }

  private requireSession(sessionId: UUID): TranslationSession {
    const s = this.translation.getSession(sessionId);
    if (!s) throw new SpablaCoreError("unknown-translation-sessionId", { sessionId });
    return s;
  }
}
