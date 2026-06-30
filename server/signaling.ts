import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { WebSocket as UpstreamWS } from "ws";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY ?? "");

const SUPABASE_URL      = process.env.SUPABASE_URL      ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

// Feature flag: "true" activa traducción server-side. Default: "false" (cliente traduce).
const TRANSLATE_SERVER_SIDE = process.env.TRANSLATE_SERVER_SIDE === "true";

// Feature flag B1: "true" → STT+MT+TTS via OpenAI Realtime (gpt-realtime-mini).
// Default: false → comportamiento clásico (Deepgram + /api/translate + /api/tts) intacto.
const USE_REALTIME_SPEECH = process.env.USE_REALTIME_SPEECH === "true";
const OPENAI_REALTIME_MODEL = "gpt-realtime-mini";
const REALTIME_VOICE = "marin";
// gpt-realtime-mini rechaza rates > 24000 (probado empíricamente). El cliente captura a 48k,
// así que decimamos 2:1 con promedio (low-pass simple) antes de enviar.
function downsample48to24(int16: Int16Array): Int16Array {
  const out = new Int16Array(int16.length >> 1);
  for (let i = 0, j = 0; j < out.length; i += 2, j++) out[j] = (int16[i] + int16[i + 1]) >> 1;
  return out;
}

// Singleton para getClaims() — JWKS cacheado en el proceso
const supabaseAuth = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LANG_NAMES: Record<string, string> = {
  es: "Spanish", en: "English", fr: "French",  de: "German",
  it: "Italian", pt: "Portuguese", ja: "Japanese", zh: "Chinese",
  ar: "Arabic",  ru: "Russian",
};

// Silence threshold (ms) before Deepgram commits speech_final per language.
// Shorter for fast-rhythm languages (ja, zh), longer for languages with natural mid-clause pauses.
const ENDPOINTING_BY_LANG: Record<string, number> = {
  es: 600, en: 500, fr: 500, de: 600,
  it: 550, pt: 600, ja: 400, zh: 400,
  ar: 600, ru: 550,
};

// ── Función de traducción server-side (llamada desde Render → OpenAI, ambos US) ──
async function translateServer(text: string, fromLang: string, toLang: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !text.trim()) return text;

  try {
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
            content: `You are a translator. Translate from ${LANG_NAMES[fromLang] ?? fromLang} to ${LANG_NAMES[toLang] ?? toLang}. Return only the translated text, nothing else.`,
          },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) { console.error("[SPABLA][TR] OpenAI error:", res.status); return text; }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() ?? text;
  } catch (err: any) {
    console.error("[SPABLA][TR] Error:", err?.message ?? err);
    return text;
  }
}

const ALLOWED_ORIGINS = ["https://spabla.vercel.app", "http://localhost:3000"];

const httpServer = createServer(async (req, res) => {
  const origin  = req.headers.origin ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      ts: Date.now(),
      translateServerSide: TRANSLATE_SERVER_SIDE,
    }));
    return;
  }

  // ── Endpoint de medición para el experimento ───────────────────────────────
  if (req.url?.startsWith("/measure-translate")) {
    const url    = new URL(req.url, "http://localhost");
    const secret = url.searchParams.get("secret") ?? "";
    const text   = url.searchParams.get("text")   ?? "Good morning, how are you?";
    const from   = url.searchParams.get("from")   ?? "en";
    const to     = url.searchParams.get("to")     ?? "es";

    if (secret !== (process.env.MEASURE_SECRET ?? "")) {
      res.writeHead(403); res.end("Forbidden"); return;
    }
    const t0          = Date.now();
    const translation = await translateServer(text, from, to);
    const translateMs = Date.now() - t0;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ translation, translateMs, from, to }));
    return;
  }

  res.writeHead(200);
  res.end("SPABLA signaling server");
});

const io = new Server(httpServer, {
  cors:       { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
});

type DGConnection = ReturnType<typeof deepgram.listen.live>;

function closeDG(conn: DGConnection | null): null {
  if (!conn) return null;
  try { conn.requestClose(); } catch { }
  return null;
}

// ── Middleware JWT ─────────────────────────────────────────────────────────────
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== "string") {
    return next(new Error("Unauthorized: missing token"));
  }
  try {
    const { data, error } = await supabaseAuth.auth.getClaims(token);
    if (error || !data?.claims?.sub) {
      return next(new Error("Unauthorized: invalid token"));
    }
    socket.data.userId          = data.claims.sub as string;
    socket.data.token           = token;
    socket.data.authorizedRooms = new Set<string>();
    next();
  } catch {
    next(new Error("Unauthorized: token verification failed"));
  }
});

// ── Voice→video hot upgrade · Phase 1 (signaling only) ──────────────────────
// Track in-flight upgrade requests per room. A second request for the same room
// while one is pending is dropped (logged). Auto-expires so a stuck request
// does not block forever if the accept never arrives.
const upgradeInFlight = new Map<string, number>();
const UPGRADE_INFLIGHT_TTL_MS = 10_000;

// ─────────────────────────────────────────────────────────────────────────────

io.on("connection", (socket: Socket) => {
  console.log("[SPABLA] Usuario conectado:", socket.id,
    `(user=${(socket.data.userId as string).substring(0, 8)}...)`);

  let dgConn: DGConnection | null = null;
  let _audioChunks = 0, _audioBytes = 0, _dgBytes = 0, _rtBytes = 0, _audioLogT = Date.now();

  // Timestamps of recent Deepgram auto-reopens — for rate limiting.
  const dgReopenTimes: number[] = [];

  // ── Realtime (B1) per-socket state — used only when USE_REALTIME_SPEECH is on ──
  let rtConn: UpstreamWS | null = null;
  let rtReady = false;
  const rtPendingChunks: string[] = []; // base64 strings queued before session.updated
  let lastInputTranscript = "";          // captured from input_audio_transcription, used as 'original' in subtitle
  // Pair currently open/opening (or last attempted while deferred). Used for idempotency
  // when update-target-lang triggers re-attempts so we don't churn upstream sessions.
  let rtFromLang:   string | null = null;
  let rtTargetLang: string | null = null;

  // ── Opens (or reopens) a Deepgram live session with the given params ────────
  function openDeepgram(lang: string, fromLang: string, targetLang: string | null) {
    dgConn = closeDG(dgConn);

    if (!process.env.DEEPGRAM_API_KEY) {
      console.error("[SPABLA][DG] DEEPGRAM_API_KEY no configurada");
      socket.emit("transcript-result", { text: "", isFinal: false, error: true });
      return;
    }

    try {
      const endpointing = ENDPOINTING_BY_LANG[fromLang] ?? 500;
      console.log(`[STT] opening session lang=${lang} fromLang=${fromLang} endpointing=${endpointing}ms`);
      let accumulatedText = "";
      let _tLastContentMs = 0;  // [PAUSE-AUDIT] timestamp of last is_final with content
      let _tSpeechFinalMs = 0;  // [PAUSE-AUDIT] timestamp of last speech_final

      const thisConn = deepgram.listen.live({
        language:        lang,
        model:           "nova-2",
        encoding:        "linear16",
        sample_rate:     48000,
        channels:        1,
        interim_results: true,
        punctuate:       true,
        smart_format:    true,
        endpointing,
      });
      dgConn = thisConn;

      thisConn.on(LiveTranscriptionEvents.Open, () => {
        console.log(`[SPABLA][DG] Sesión abierta: socket=${socket.id} lang=${lang}`);
      });

      thisConn.on(LiveTranscriptionEvents.Transcript, async (dgData: any) => {
        const alt = dgData?.channel?.alternatives?.[0];
        if (!alt || alt.transcript === undefined) return;

        const text        = alt.transcript as string;
        const isFinal     = (dgData.is_final     as boolean) ?? false;
        const speechFinal = (dgData.speech_final as boolean) ?? false;
        const tReceived   = Date.now();
        console.log(`[R1-AUDIT] IN  is_final=${isFinal} speech_final=${speechFinal} acc_before="${accumulatedText.substring(0,70)}" text="${text.substring(0,70)}"`); // [R1-AUDIT]
        if (text.trim() && _tSpeechFinalMs > 0) {
          const _gap   = tReceived - _tSpeechFinalMs;
          const _total = _tLastContentMs > 0 ? tReceived - _tLastContentMs : _gap;
          console.log(`[PAUSE-AUDIT] RESUME gap=${_gap}ms totalPause=${_total}ms`); // [PAUSE-AUDIT]
          _tSpeechFinalMs = 0;
        }

        // Accumulate is_final segments — speech_final often arrives with empty text
        // when Deepgram already delivered content via earlier is_final events.
        if (isFinal && text.trim()) {
          accumulatedText = (accumulatedText + " " + text).trim();
        }
        if (isFinal) console.log(`[R2-AUDIT] ACCUM acc_after="${accumulatedText.substring(0,80)}" isFinal=${isFinal} speech_final=${speechFinal}`); // [R2-AUDIT]
        if (isFinal && text.trim()) _tLastContentMs = tReceived; // [PAUSE-AUDIT]

        // Diagnostic log — compare is_final vs speech_final in production
        if (isFinal || text.trim()) {
          console.log(`[STT] lang=${socket.data.fromLang} is_final=${isFinal} speech_final=${speechFinal} "${text.substring(0, 45)}"`);
        }

        // speech_final = complete utterance (silence confirmed). Use as the only trigger
        // for translation. is_final-only events become running partials in the client caption.
        const isActualFinal = speechFinal;

        // On speech_final use the full accumulated text (covers multi-segment long phrases).
        const finalText = isActualFinal ? (accumulatedText || text.trim()) : text;
        if (isActualFinal) console.log(`[TRACE-1] DG speech_final | raw="${text.substring(0,60)}" accumulated="${accumulatedText.substring(0,60)}" finalText="${finalText.substring(0,60)}"`);
        if (isActualFinal && _tLastContentMs > 0) {
          const _sil = tReceived - _tLastContentMs;
          _tSpeechFinalMs = tReceived;
          console.log(`[PAUSE-AUDIT] SPEECH_FINAL silenceMs=${_sil} finalText="${finalText.substring(0,60)}"`); // [PAUSE-AUDIT]
        }
        if (isActualFinal) accumulatedText = "";
        if (isActualFinal) console.log(`[R2-AUDIT] RESET acc_post="${accumulatedText}" finalText="${finalText.substring(0,80)}"`); // [R2-AUDIT]
        if (isActualFinal && finalText) console.log(`[STT SERVER ACCUMULATED] final="${finalText.substring(0, 60)}"`);
        console.log(`[R1-AUDIT] OUT isFinal=${isActualFinal} speech_final_was=${speechFinal} fragment=${isFinal && !speechFinal && !!finalText.trim()} text="${finalText.substring(0,70)}"`); // [R1-AUDIT]

        const fromL   = socket.data.fromLang   as string | undefined;
        const toL     = socket.data.targetLang as string | undefined;
        const roomId  = socket.data.roomId     as string | undefined;
        const canTranslate = TRANSLATE_SERVER_SIDE
          && isActualFinal
          && !!finalText
          && !!fromL && !!toL
          && fromL !== toL
          && !!roomId
          && !!process.env.OPENAI_API_KEY;

        if (canTranslate) {
          // ── Experimento: traducción server-side ─────────────────────────
          const tStart = Date.now();
          const translated = await translateServer(finalText, fromL!, toL!);
          const translateMs = Date.now() - tStart;
          const tEmit = Date.now();

          console.log(`[STT] speech_final→translate ${translateMs}ms total=${tEmit - tReceived}ms | "${finalText.substring(0, 30)}" → "${translated.substring(0, 30)}"`);

          // Notificar al sender que el servidor traduce (omite /api/translate)
          socket.emit("transcript-result", {
            text: finalText, isFinal: true, serverWillTranslate: true,
          });

          // Emitir subtítulo al receptor (socket.to excluye al sender)
          if (socket.connected) {
            console.log(`[TRACE-3] server→receiver subtitle original="${finalText.substring(0,60)}" translated="${translated.substring(0,60)}"`);
            socket.to(roomId!).emit("subtitle", {
              original: finalText,
              translated,
              fromLang: fromL,
              _timings: { translateMs, serverEmitMs: tEmit },
            });
          }
        } else {
          // ── Comportamiento actual: cliente traduce ──────────────────────
          if (isActualFinal) console.log(`[TRACE-3] server→sender transcript-result text="${finalText.substring(0,60)}"`);
          console.log(`[R2-AUDIT] TR_EMIT text="${finalText.substring(0,80)}" isFinal=${isActualFinal} speech_final_was=${speechFinal}`); // [R2-AUDIT]
          socket.emit("transcript-result", { text: finalText, isFinal: isActualFinal });
        }
      });

      thisConn.on(LiveTranscriptionEvents.Error, (err: any) => {
        console.error("[SPABLA][DG] Error:", err?.message ?? err);
        socket.emit("transcript-result", { text: "", isFinal: false, error: true });
        if (dgConn === thisConn) dgConn = closeDG(thisConn);
      });

      thisConn.on(LiveTranscriptionEvents.Close, () => {
        console.log(`[SPABLA][DG] closed: socket=${socket.id}`);
        if (dgConn !== thisConn) return;
        dgConn = null;

        if (!socket.connected || !socket.data.dgTranscribing) {
          console.log(`[SPABLA][DG] reopen skipped (connected=${socket.connected} transcribing=${socket.data.dgTranscribing})`);
          return;
        }

        // Rate limit: max 3 auto-reopens in 60 seconds
        const now = Date.now();
        while (dgReopenTimes.length > 0 && dgReopenTimes[0] < now - 60_000) {
          dgReopenTimes.shift();
        }
        if (dgReopenTimes.length >= 3) {
          console.warn(`[SPABLA][DG] reopen skipped — rate limit (${dgReopenTimes.length} in last 60s): socket=${socket.id}`);
          return;
        }

        dgReopenTimes.push(now);
        console.log(`[SPABLA][DG] reopening after close (attempt ${dgReopenTimes.length}/3 in last 60s): socket=${socket.id} lang=${socket.data.dgLang}`);
        openDeepgram(
          socket.data.dgLang     as string,
          socket.data.dgFromLang as string,
          socket.data.dgTargetLang as string | null,
        );
      });

    } catch (err: any) {
      console.error("[SPABLA][DG] No se pudo abrir sesión:", err?.message ?? err);
      socket.emit("transcript-result", { text: "", isFinal: false, error: true });
      dgConn = null;
    }
  }
  // ── End openDeepgram ────────────────────────────────────────────────────────

  function closeRT(reason: string = "internal"): null {
    if (rtConn) {
      const ws = rtConn;
      console.log(`[SPABLA][RT] closing session ${rtFromLang ?? "?"}→${rtTargetLang ?? "?"} (${reason}) — readyState=${ws.readyState}`);
      // Polite stop: ask OpenAI to cancel any in-flight response and drop the input buffer
      // BEFORE the close handshake, so it stops generating audio immediately instead of
      // continuing to emit deltas during the ~100-300ms close window.
      if (ws.readyState === ws.OPEN) {
        try { ws.send(JSON.stringify({ type: "response.cancel" })); } catch { /* noop */ }
        try { ws.send(JSON.stringify({ type: "input_audio_buffer.clear" })); } catch { /* noop */ }
      }
      // Clean close with explicit code 1000. ws.close() with no args defaults to NO status,
      // which the OpenAI side reports as code 1005 ("no status received") — looks like a
      // dirty disconnect in logs. Code 1000 = "normal closure".
      try { ws.close(1000, "client-done"); } catch { /* noop */ }
    } else if (rtFromLang) {
      // Deferred state: openRealtime was called but targetLang was missing, so no upstream
      // ws was ever created. Just clear the remembered pair.
      console.log(`[SPABLA][RT] clearing deferred pair ${rtFromLang}→${rtTargetLang ?? "null"} (${reason})`);
    }
    rtConn = null;
    rtReady = false;
    rtPendingChunks.length = 0;
    rtFromLang = null;
    rtTargetLang = null;
    return null;
  }

  // ── B1: open OpenAI Realtime upstream — only invoked when USE_REALTIME_SPEECH is on ──
  // Idempotent: if rtConn already open/opening for the same (fromLang, targetLang) pair, no-op.
  // If targetLang is missing or equal to fromLang, defer (don't open) — will retry when
  // update-target-lang arrives with a valid value (handler below).
  function openRealtime(fromLang: string, targetLang: string | null) {
    if (rtConn && rtFromLang === fromLang && rtTargetLang === targetLang) {
      console.log(`[SPABLA][RT] already open/opening for ${fromLang}→${targetLang}, skipping reopen`);
      return;
    }
    closeRT("reopen-different-pair");
    if (!process.env.OPENAI_API_KEY) {
      console.error("[SPABLA][RT] OPENAI_API_KEY no configurada");
      socket.emit("transcript-result", { text: "", isFinal: false, error: true });
      return;
    }
    if (!targetLang || targetLang === fromLang) {
      console.warn(`[SPABLA][RT] deferring open: targetLang missing or equals fromLang (from=${fromLang} target=${targetLang}). Will retry when update-target-lang arrives.`);
      // Remember the from-lang we wanted; targetLang stays null so the retry path detects a real change.
      rtFromLang = fromLang;
      rtTargetLang = null;
      return;
    }
    const srcName = LANG_NAMES[fromLang]   ?? fromLang;
    const tgtName = LANG_NAMES[targetLang] ?? targetLang;
    console.log(`[SPABLA][RT] opening session ${fromLang}→${targetLang} (${srcName}→${tgtName})`);
    const ws = new UpstreamWS(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(OPENAI_REALTIME_MODEL)}`, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    });
    rtConn = ws;
    rtReady = false;
    rtFromLang = fromLang;
    rtTargetLang = targetLang;
    lastInputTranscript = "";

    ws.on("open", () => {
      console.log(`[SPABLA][RT] upstream open: socket=${socket.id}`);
    });

    ws.on("error", (err: Error) => {
      console.error(`[SPABLA][RT] upstream error: ${err.message}`);
    });

    ws.on("close", (code: number, reason: Buffer) => {
      console.log(`[SPABLA][RT] upstream closed code=${code} reason=${reason?.toString() || ""}`);
      if (rtConn === ws) { rtConn = null; rtReady = false; rtPendingChunks.length = 0; rtFromLang = null; rtTargetLang = null; }
    });

    ws.on("message", (raw: Buffer) => {
      // Stale-ws guard: if closeRT() ran (rtConn null) or a new openRealtime() replaced this
      // upstream (rtConn points elsewhere), suppress all further event processing — no logs,
      // no forwarding, no emits. Without this, OpenAI's in-flight deltas during the close
      // handshake keep firing this handler after the user already hung up.
      if (rtConn !== ws) return;
      let m: any;
      try { m = JSON.parse(raw.toString("utf8")); } catch { return; }
      const tp = m?.type as string | undefined;
      if (!tp) return;

      if (tp === "error") {
        console.error("[SPABLA][RT] error event:", JSON.stringify(m.error));
        return;
      }

      if (tp === "session.created") {
        const cfg = {
          type: "session.update",
          session: {
            type: "realtime",
            output_modalities: ["audio"],
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                transcription: { model: "whisper-1" },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 250,
                  create_response: true,
                  interrupt_response: true,
                },
              },
              output: { format: { type: "audio/pcm", rate: 24000 }, voice: REALTIME_VOICE },
            },
            instructions:
              `You are a simultaneous interpreter. The user speaks ${srcName}. ` +
              `Translate everything they say into ${tgtName} in real time, with natural intonation. ` +
              `Output ONLY the ${tgtName} translation. Do not respond, do not converse, do not summarise. ` +
              `Just translate verbatim, sentence by sentence, as soon as possible.`,
          },
        };
        try { ws.send(JSON.stringify(cfg)); } catch (err) { console.error("[SPABLA][RT] session.update send failed:", err); }
        return;
      }

      if (tp === "session.updated") {
        rtReady = true;
        // Flush any audio chunks that arrived before the session was ready.
        while (rtPendingChunks.length > 0) {
          const audio = rtPendingChunks.shift()!;
          try { ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio })); } catch (err) { console.error("[SPABLA][RT] flush send failed:", err); break; }
        }
        return;
      }

      if (tp === "conversation.item.input_audio_transcription.delta" && m.delta) {
        socket.emit("transcript-result", { text: m.delta as string, isFinal: false });
        return;
      }

      if (tp === "conversation.item.input_audio_transcription.completed" && m.transcript) {
        lastInputTranscript = m.transcript as string;
        // Sender path: serverWillTranslate=true makes the existing client handler
        // create the local caption WITHOUT calling /api/translate or emitting subtitle.
        socket.emit("transcript-result", { text: lastInputTranscript, isFinal: true, serverWillTranslate: true });
        return;
      }

      if (tp === "response.output_audio.delta" && m.delta) {
        const roomId = socket.data.roomId as string | undefined;
        if (roomId) socket.to(roomId).emit("translated-audio-chunk", { audio: m.delta as string });
        return;
      }

      if (tp === "response.output_audio_transcript.done" && m.transcript) {
        const roomId = socket.data.roomId as string | undefined;
        const fromL  = socket.data.fromLang as string | undefined;
        if (roomId) {
          socket.to(roomId).emit("subtitle", {
            original:   lastInputTranscript,
            translated: m.transcript as string,
            fromLang:   fromL,
            // serverWillStreamAudio tells the peer NOT to call speak() — translated audio
            // already arrived via translated-audio-chunk events.
            serverWillStreamAudio: true,
          });
        }
        return;
      }
    });
  }
  // ── End openRealtime ────────────────────────────────────────────────────────

  socket.on("join-room", async (roomId: string) => {
    if (!UUID_REGEX.test(roomId)) {
      socket.emit("join-error", { message: "Invalid room ID" });
      return;
    }

    const authorizedRooms = socket.data.authorizedRooms as Set<string>;
    if (authorizedRooms.has(roomId)) {
      console.log(`[SPABLA][ROOM][BEFORE_JOIN] cached socket=${socket.id} room=${roomId}`);
      socket.join(roomId);
      console.log(`[SPABLA][ROOM][AFTER_JOIN] cached socket=${socket.id} room=${roomId}`);
      const sockets = await io.in(roomId).fetchSockets();
      const otherSocketIds = sockets.filter(s => s.id !== socket.id).map(s => s.id);
      socket.emit("room-users", otherSocketIds);
      console.log(`[SPABLA][ROOM][USER_JOINED_EMIT] cached socket=${socket.id} room=${roomId}`);
      socket.to(roomId).emit("user-joined", socket.id);
      console.log(`[SPABLA][ROOM_USERS] cached ${socket.id} → room ${roomId} | others: [${otherSocketIds.join(", ")}]`);
      console.log(`[SPABLA] ${socket.id} re-joined sala (cached): ${roomId}`);
      return;
    }

    const userClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${socket.data.token as string}` } },
      auth:   { persistSession: false, autoRefreshToken: false },
    });

    const { data: asParticipant } = await userClient
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", roomId)
      .eq("user_id", socket.data.userId)
      .maybeSingle();

    let asCreator = null;
    if (!asParticipant) {
      const { data } = await userClient
        .from("conversations")
        .select("id")
        .eq("id", roomId)
        .eq("created_by", socket.data.userId)
        .maybeSingle();
      asCreator = data;
    }

    if (!asParticipant && !asCreator) {
      console.log(`[SPABLA] REJECTED join-room: socket=${socket.id} room=${roomId}`);
      socket.emit("join-error", { message: "Not authorized for this room" });
      return;
    }

    authorizedRooms.add(roomId);
    socket.data.roomId = roomId;

    console.log(`[SPABLA][ROOM][BEFORE_JOIN] socket=${socket.id} room=${roomId}`);
    socket.join(roomId);
    console.log(`[SPABLA][ROOM][AFTER_JOIN] socket=${socket.id} room=${roomId}`);
    const sockets = await io.in(roomId).fetchSockets();
    const otherSocketIds = sockets.filter(s => s.id !== socket.id).map(s => s.id);
    socket.emit("room-users", otherSocketIds);
    console.log(`[SPABLA][ROOM][USER_JOINED_EMIT] socket=${socket.id} room=${roomId} → notifying others: [${otherSocketIds.join(", ")}]`);
    socket.to(roomId).emit("user-joined", socket.id);
    console.log(`[SPABLA][ROOM_USERS] ${socket.id} → room ${roomId} | others: [${otherSocketIds.join(", ")}]`);
    console.log(`[SPABLA] ${socket.id} (user=${(socket.data.userId as string).substring(0, 8)}) entró en sala: ${roomId}`);
  });

  socket.on("offer", (data: { roomId: string; offer: RTCSessionDescriptionInit }) => {
    socket.to(data.roomId).emit("offer", { from: socket.id, offer: data.offer });
  });

  socket.on("answer", (data: { roomId: string; answer: RTCSessionDescriptionInit }) => {
    socket.to(data.roomId).emit("answer", { from: socket.id, answer: data.answer });
  });

  socket.on("ice-candidate", (data: { roomId: string; candidate: RTCIceCandidateInit }) => {
    socket.to(data.roomId).emit("ice-candidate", { from: socket.id, candidate: data.candidate });
  });

  // ── Voice→video hot upgrade · Phase 1 ─────────────────────────────────────
  // Pure relay: forward upgrade-request / upgrade-accept between peers in the room.
  // No renegotiation here — that's Phase 2. This phase only validates the wire.
  socket.on("upgrade-request", (data: { roomId?: string; to?: "video" } = {}) => {
    const roomId = data.roomId ?? (socket.data.roomId as string | undefined);
    if (!roomId) {
      console.warn(`[SPABLA][UPGRADE] request from socket=${socket.id} ignored — no roomId`);
      return;
    }
    // Drop stale in-flight entries opportunistically.
    const now = Date.now();
    for (const [r, ts] of upgradeInFlight) if (now - ts > UPGRADE_INFLIGHT_TTL_MS) upgradeInFlight.delete(r);

    if (upgradeInFlight.has(roomId)) {
      console.warn(`[SPABLA][UPGRADE] request from socket=${socket.id} room=${roomId} dropped — upgrade already in progress`);
      return;
    }
    upgradeInFlight.set(roomId, now);
    console.log(`[SPABLA][UPGRADE] request from socket=${socket.id} room=${roomId} to=${data.to ?? "video"} → forwarding to peer`);
    socket.to(roomId).emit("upgrade-request", { fromSocketId: socket.id, to: data.to ?? "video" });
  });

  socket.on("upgrade-accept", (data: { roomId?: string } = {}) => {
    const roomId = data.roomId ?? (socket.data.roomId as string | undefined);
    if (!roomId) {
      console.warn(`[SPABLA][UPGRADE] accept from socket=${socket.id} ignored — no roomId`);
      return;
    }
    console.log(`[SPABLA][UPGRADE] accept from socket=${socket.id} room=${roomId} → forwarding to peer + clearing in-flight`);
    socket.to(roomId).emit("upgrade-accept", { fromSocketId: socket.id });
    upgradeInFlight.delete(roomId);
  });

  socket.on("subtitle", (data: {
    roomId: string; originalText: string; translatedText: string;
    fromLang: string; toLang: string; ts: number;
  }) => {
    socket.to(data.roomId).emit("subtitle", { from: socket.id, ...data });
  });

  // Actualiza el idioma destino sin reiniciar la sesión Deepgram
  socket.on("update-target-lang", (targetLang: string | null) => {
    socket.data.targetLang    = targetLang ?? null;
    socket.data.dgTargetLang  = targetLang ?? null;
    console.log(`[SPABLA] update-target-lang: socket=${socket.id} targetLang=${targetLang}`);

    // B1: gatillo de retry. Si la transcripción ya está activa y entramos en modo realtime,
    // (re)abrimos la sesión upstream con el target ahora resuelto. openRealtime es idempotente:
    // si rtConn ya está abierto para el mismo par (fromLang, targetLang), no hace nada.
    if (USE_REALTIME_SPEECH && socket.data.dgTranscribing && socket.data.dgFromLang) {
      const fromLang = socket.data.dgFromLang as string;
      const tgt      = targetLang ?? null;
      if (rtConn && rtFromLang === fromLang && rtTargetLang === tgt) {
        // Same pair already open — no-op handled inside openRealtime, log for visibility.
        console.log(`[SPABLA][RT] update-target-lang: pair ${fromLang}→${tgt} already open, skipping`);
      } else if (!tgt || tgt === fromLang) {
        // Still no valid target — leave deferred state as-is, don't churn.
        console.log(`[SPABLA][RT] update-target-lang: target still missing/equal (from=${fromLang} target=${tgt}), staying deferred`);
      } else {
        console.log(`[SPABLA][RT] update-target-lang: ${rtConn ? "re-opening" : "opening (was deferred)"} ${fromLang}→${tgt}`);
        openRealtime(fromLang, tgt);
      }
    }
  });

  socket.on("transcribe-start", async ({ lang, fromLang, targetLang }: {
    lang: string; fromLang?: string; targetLang?: string | null;
  }) => {
    // Persist params so openDeepgram() can reuse them on auto-reopen
    socket.data.dgLang        = lang;
    socket.data.dgFromLang    = fromLang   ?? lang;
    socket.data.dgTargetLang  = targetLang ?? null;
    socket.data.dgTranscribing = true;

    // Also keep legacy fields used by transcript handler
    socket.data.fromLang   = fromLang   ?? lang;
    socket.data.targetLang = targetLang ?? null;

    if (USE_REALTIME_SPEECH) {
      openRealtime(socket.data.dgFromLang as string, socket.data.dgTargetLang as string | null);
    } else {
      openDeepgram(lang, socket.data.dgFromLang as string, socket.data.dgTargetLang as string | null);
    }
  });

  socket.on("audio-chunk", (chunk: ArrayBuffer) => {
    _audioChunks++;
    _audioBytes += chunk.byteLength;
    const _now = Date.now();
    if (_now - _audioLogT >= 1000) {
      const s = (_now - _audioLogT) / 1000;
      console.log(`[TRACE AUDIO SERVER] chunks=${Math.round(_audioChunks / s)}/s bytes=${Math.round(_audioBytes / s)}/s`);
      console.log(`[TRACE DEEPGRAM FEED] bytesSent=${Math.round(_dgBytes / s)}/s`);
      // B1 observability: how many bytes (decimated 24k pcm16) we actually pushed upstream
      // to OpenAI Realtime this second, plus the connection state. Settles whether the audio
      // is reaching the engine or being dropped by the `if (!rtConn) return` guard.
      console.log(`[TRACE RT FEED] bytesSent=${Math.round(_rtBytes / s)}/s rtConn=${rtConn ? "open" : "null"} rtReady=${rtReady} pendingQueue=${rtPendingChunks.length} from=${rtFromLang ?? "?"} to=${rtTargetLang ?? "?"}`);
      _audioChunks = 0; _audioBytes = 0; _dgBytes = 0; _rtBytes = 0; _audioLogT = _now;
    }
    if (USE_REALTIME_SPEECH) {
      // B1: decimate 48k → 24k mono pcm16, base64-encode, send as input_audio_buffer.append.
      // Queue while session.updated has not yet arrived.
      if (!rtConn) return;
      const int16     = new Int16Array(chunk);
      const decimated = downsample48to24(int16);
      const audio     = Buffer.from(decimated.buffer, decimated.byteOffset, decimated.byteLength).toString("base64");
      if (rtReady) {
        try { rtConn.send(JSON.stringify({ type: "input_audio_buffer.append", audio })); _rtBytes += decimated.byteLength; } catch (err) { console.error("[SPABLA][RT] append send failed:", err); }
      } else {
        // Cap pending buffer to ~10s of audio so a slow handshake can't grow without bound.
        if (rtPendingChunks.length < 120) rtPendingChunks.push(audio);
      }
      return;
    }
    if (!dgConn) return;
    _dgBytes += chunk.byteLength;
    try { dgConn.send(chunk); } catch { }
  });

  socket.on("transcribe-stop", () => {
    socket.data.dgTranscribing = false;
    dgConn = closeDG(dgConn);
    if (rtConn || rtFromLang) closeRT("transcribe-stop");
    console.log(`[SPABLA][DG] Transcripción detenida por ${socket.id}`);
  });

  socket.on("disconnect", () => {
    socket.data.dgTranscribing = false;
    dgConn = closeDG(dgConn);
    if (rtConn || rtFromLang) closeRT("disconnect");
    console.log("[SPABLA] Usuario desconectado:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log("[SPABLA] Servidor de señalización en puerto", PORT);
  console.log("[SPABLA] TRANSLATE_SERVER_SIDE:", TRANSLATE_SERVER_SIDE);
  console.log("[SPABLA] USE_REALTIME_SPEECH:", USE_REALTIME_SPEECH);
});
