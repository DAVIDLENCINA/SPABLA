import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY ?? "");

const SUPABASE_URL      = process.env.SUPABASE_URL      ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

// Feature flag: "true" activa traducción server-side. Default: "false" (cliente traduce).
const TRANSLATE_SERVER_SIDE = process.env.TRANSLATE_SERVER_SIDE === "true";

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
  // Mide la latencia de traducción server-side (Render→OpenAI) con 1 llamada real.
  // Protegido con secreto en query param para evitar abuso.
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

// ─────────────────────────────────────────────────────────────────────────────

io.on("connection", (socket: Socket) => {
  console.log("[SPABLA] Usuario conectado:", socket.id,
    `(user=${(socket.data.userId as string).substring(0, 8)}...)`);

  let dgConn: DGConnection | null = null;
  let _audioChunks = 0, _audioBytes = 0, _dgBytes = 0, _audioLogT = Date.now();

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
    socket.data.roomId = roomId; // guardado para translate server-side

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

  socket.on("subtitle", (data: {
    roomId: string; originalText: string; translatedText: string;
    fromLang: string; toLang: string; ts: number;
  }) => {
    socket.to(data.roomId).emit("subtitle", { from: socket.id, ...data });
  });

  // Actualiza el idioma destino sin reiniciar la sesión Deepgram
  socket.on("update-target-lang", (targetLang: string | null) => {
    socket.data.targetLang = targetLang ?? null;
    console.log(`[SPABLA] update-target-lang: socket=${socket.id} targetLang=${targetLang}`);
  });

  socket.on("transcribe-start", async ({ lang, fromLang, targetLang }: {
    lang: string; fromLang?: string; targetLang?: string | null;
  }) => {
    dgConn = closeDG(dgConn);

    // Almacenar idiomas para traducción server-side
    socket.data.fromLang   = fromLang   ?? lang;
    socket.data.targetLang = targetLang ?? null;

    if (!process.env.DEEPGRAM_API_KEY) {
      console.error("[SPABLA][DG] DEEPGRAM_API_KEY no configurada");
      socket.emit("transcript-result", { text: "", isFinal: false, error: true });
      return;
    }

    try {
      const endpointing = ENDPOINTING_BY_LANG[socket.data.fromLang as string] ?? 500;
      console.log(`[STT] opening session lang=${lang} fromLang=${socket.data.fromLang} endpointing=${endpointing}ms`);
      let accumulatedText = "";
      // Capture the connection in a local const so Close/Error handlers
      // can check whether dgConn still refers to THIS session before
      // nulling it. Without this, a stale Close event from a previous
      // session overwrites the current dgConn with null (closure bug).
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

        // Accumulate is_final segments — speech_final often arrives with empty text
        // when Deepgram already delivered content via earlier is_final events.
        if (isFinal && text.trim()) {
          accumulatedText = (accumulatedText + " " + text).trim();
        }

        // Diagnostic log — compare is_final vs speech_final in production
        if (isFinal || text.trim()) {
          console.log(`[STT] lang=${socket.data.fromLang} is_final=${isFinal} speech_final=${speechFinal} "${text.substring(0, 45)}"`);
        }

        // speech_final = complete utterance (silence confirmed). Use as the only trigger
        // for translation. is_final-only events become running partials in the client caption.
        const isActualFinal = isFinal;

        // On speech_final use the full accumulated text (covers multi-segment long phrases).
        const finalText = isActualFinal ? (accumulatedText || text.trim()) : text;
        if (isActualFinal) console.log(`[TRACE-1] DG speech_final | raw="${text.substring(0,60)}" accumulated="${accumulatedText.substring(0,60)}" finalText="${finalText.substring(0,60)}"`);
        if (isActualFinal) accumulatedText = "";
        if (isActualFinal && finalText) console.log(`[STT SERVER ACCUMULATED] final="${finalText.substring(0, 60)}"`);

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
          // isFinal reflects speech_final — only true for complete utterances
          if (isActualFinal) console.log(`[TRACE-3] server→sender transcript-result text="${finalText.substring(0,60)}"`);
          socket.emit("transcript-result", { text: finalText, isFinal: isActualFinal });
        }
      });

      thisConn.on(LiveTranscriptionEvents.Error, (err: any) => {
        console.error("[SPABLA][DG] Error:", err?.message ?? err);
        socket.emit("transcript-result", { text: "", isFinal: false, error: true });
        if (dgConn === thisConn) dgConn = closeDG(thisConn);
      });

      thisConn.on(LiveTranscriptionEvents.Close, () => {
        console.log(`[SPABLA][DG] Sesión cerrada: socket=${socket.id}`);
        if (dgConn === thisConn) dgConn = null;
      });

    } catch (err: any) {
      console.error("[SPABLA][DG] No se pudo abrir sesión:", err?.message ?? err);
      socket.emit("transcript-result", { text: "", isFinal: false, error: true });
      dgConn = null;
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
      _audioChunks = 0; _audioBytes = 0; _dgBytes = 0; _audioLogT = _now;
    }
    if (!dgConn) return;
    _dgBytes += chunk.byteLength;
    try { dgConn.send(chunk); } catch { }
  });

  socket.on("transcribe-stop", () => {
    dgConn = closeDG(dgConn);
    console.log(`[SPABLA][DG] Transcripción detenida por ${socket.id}`);
  });

  socket.on("disconnect", () => {
    dgConn = closeDG(dgConn);
    console.log("[SPABLA] Usuario desconectado:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log("[SPABLA] Servidor de señalización en puerto", PORT);
  console.log("[SPABLA] TRANSLATE_SERVER_SIDE:", TRANSLATE_SERVER_SIDE);
});
