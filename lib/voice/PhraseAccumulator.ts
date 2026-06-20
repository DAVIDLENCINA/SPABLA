// Filler sounds that should not trigger translation when spoken in isolation.
// Exact match only (normalized: lowercase, punctuation stripped).
const FILLER_BLOCKLIST = new Set([
  // ES
  "eh", "mm", "mmm", "mhm", "ah", "uh", "um", "eeh", "aah",
  // EN
  "hmm", "er", "erm",
  // FR
  "euh", "hm",
]);

const SILENCE_MS  = 2200;   // primary flush trigger
const MAX_CHARS   = 400;    // size-based flush
const MAX_TIME_MS = 15_000; // time-based flush (safety net)

export class PhraseAccumulator {
  private buffer:            string[]  = [];
  // PROVISIONAL: using text-based dedup because server does not yet emit segmentId.
  // Replace with server-provided start timestamp when available (server/signaling.ts).
  private seenIds            = new Set<string>();
  private silenceTimer:      ReturnType<typeof setTimeout> | null = null;
  private accumulationStart  = 0;
  private readonly onFlush:  (text: string) => void | Promise<void>;

  constructor(onFlush: (text: string) => void | Promise<void>) {
    this.onFlush = onFlush;
  }

  add(text: string, segmentId?: string): void {
    // PROVISIONAL: fall back to text slice when no server-side segmentId is provided.
    const id = segmentId ?? text.trim().slice(0, 40);
    if (this.seenIds.has(id)) {
      console.log("[ACM] duplicate segment ignored:", id);
      return;
    }

    // Time limit: flush existing buffer before accepting new segment into a fresh cycle.
    if (this.buffer.length > 0 && Date.now() - this.accumulationStart >= MAX_TIME_MS) {
      console.log("[ACM] flush: time limit (15s)");
      this._flush();
    }

    this.seenIds.add(id);
    if (this.buffer.length === 0) this.accumulationStart = Date.now();
    this.buffer.push(text.trim());

    if (this.buffer.join(" ").length >= MAX_CHARS) {
      console.log("[ACM] flush: size limit (400 chars)");
      this._flush();
      return;
    }

    this._resetTimer();
  }

  // Called on every partial (is_final: false) to keep the silence window open.
  activity(): void {
    if (this.buffer.length > 0) this._resetTimer();
  }

  destroy(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
    this.buffer       = [];
    this.seenIds.clear();
  }

  private _resetTimer(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      console.log("[ACM] flush: silence (2200ms)");
      this._flush();
    }, SILENCE_MS);
  }

  private _flush(): void {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }

    const text = this.buffer.join(" ").trim();
    this.buffer           = [];
    this.seenIds.clear();
    this.accumulationStart = 0;

    if (!text) return;

    const normalized = text.toLowerCase().replace(/[.,!?¿¡]/g, "").trim();
    if (FILLER_BLOCKLIST.has(normalized)) {
      console.log("[ACM] flush: blocklist hit — discarded:", text);
      return;
    }

    console.log("[ACM] flush →", text.substring(0, 60));
    void this.onFlush(text);
  }
}
