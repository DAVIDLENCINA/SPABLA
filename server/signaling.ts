import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

/* ─── Deepgram client ─────────────────────────────────────────
   DEEPGRAM_API_KEY must be set in the Render environment.
   The server will start without it but Deepgram sessions will
   fail — a console.error will fire per attempt.
─────────────────────────────────────────────────────────────── */
const deepgram = createClient(process.env.DEEPGRAM_API_KEY ?? "");

/* ─── HTTP server ─────────────────────────────────────────── */
const httpServer = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://spabla.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", ts: Date.now() }));
    return;
  }

  res.writeHead(200);
  res.end("SPABLA signaling server");
});

/* ─── Socket.io ───────────────────────────────────────────── */
const io = new Server(httpServer, {
  cors: {
    origin: ["https://spabla.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST"],
  },
  transports: ["polling"],
});

/* ─── per-socket Deepgram session type ───────────────────── */
type DGConnection = ReturnType<typeof deepgram.listen.live>;

/* ─── helpers ────────────────────────────────────────────── */
function closeDG(conn: DGConnection | null): null {
  if (!conn) return null;
  try { conn.requestClose(); } catch { /* already closed */ }
  return null;
}

/* ─── connection handler ─────────────────────────────────── */
io.on("connection", (socket: Socket) => {
  console.log("[SPABLA] Usuario conectado:", socket.id);

  let dgConn: DGConnection | null = null;

  /* ── WebRTC signaling (unchanged) ── */

  socket.on("join-room", (roomId: string) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", socket.id);
    console.log(`[SPABLA] ${socket.id} entró en sala: ${roomId}`);
  });

  socket.on("offer", (data: { to: string; offer: RTCSessionDescriptionInit }) => {
    io.to(data.to).emit("offer", { from: socket.id, offer: data.offer });
  });

  socket.on("answer", (data: { to: string; answer: RTCSessionDescriptionInit }) => {
    io.to(data.to).emit("answer", { from: socket.id, answer: data.answer });
  });

  socket.on("ice-candidate", (data: { to: string; candidate: RTCIceCandidateInit }) => {
    io.to(data.to).emit("ice-candidate", { from: socket.id, candidate: data.candidate });
  });

  /* ── subtitle broadcast (unchanged) ── */

  socket.on("subtitle", (data: {
    roomId: string;
    originalText: string;
    translatedText: string;
    fromLang: string;
    toLang: string;
    ts: number;
  }) => {
    socket.to(data.roomId).emit("subtitle", { from: socket.id, ...data });
  });

  /* ── Deepgram: open session ────────────────────────────────
     Client emits "transcribe-start" once per CC button press.
     lang: BCP-47 language code, e.g. "es", "en", "fr", "de"
  ─────────────────────────────────────────────────────────── */
  socket.on("transcribe-start", async ({ lang }: { lang: string }) => {
    // close any existing session first (e.g. CC toggled rapidly)
    dgConn = closeDG(dgConn);

    if (!process.env.DEEPGRAM_API_KEY) {
      console.error("[SPABLA][DG] DEEPGRAM_API_KEY no configurada");
      socket.emit("transcript-result", { text: "", isFinal: false, error: true });
      return;
    }

    try {
      dgConn = deepgram.listen.live({
        language:        lang,        // "es" | "en" | "fr" | "de"
        model:           "nova-2",
        encoding:        "linear16",  // matches Int16Array sent by client
        sample_rate:     48000,
        channels:        1,
        interim_results: true,        // send partials for responsive UI
        punctuate:       true,
        smart_format:    true,
        endpointing:     300,         // ms silence before finalising a segment
      });

      dgConn.on(LiveTranscriptionEvents.Open, () => {
        console.log(`[SPABLA][DG] Sesión abierta: socket=${socket.id} lang=${lang}`);
      });

      dgConn.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const alt = data?.channel?.alternatives?.[0];
        if (!alt || alt.transcript === undefined) return;

        // always forward — client ignores empty interim strings
        socket.emit("transcript-result", {
          text:    alt.transcript as string,
          isFinal: (data.is_final as boolean) ?? false,
        });
      });

      dgConn.on(LiveTranscriptionEvents.Error, (err: any) => {
        console.error("[SPABLA][DG] Error:", err?.message ?? err);
        socket.emit("transcript-result", { text: "", isFinal: false, error: true });
        dgConn = closeDG(dgConn);
      });

      dgConn.on(LiveTranscriptionEvents.Close, () => {
        console.log(`[SPABLA][DG] Sesión cerrada: socket=${socket.id}`);
        dgConn = null;
      });

    } catch (err: any) {
      console.error("[SPABLA][DG] No se pudo abrir sesión:", err?.message ?? err);
      socket.emit("transcript-result", { text: "", isFinal: false, error: true });
      dgConn = null;
    }
  });

  /* ── Deepgram: forward audio chunk ────────────────────────
     Client emits raw Int16Array buffer (~85ms chunks at 48kHz).
     We forward it directly — no re-encoding needed.
  ─────────────────────────────────────────────────────────── */
  socket.on("audio-chunk", (chunk: ArrayBuffer) => {
    if (!dgConn) return;
    try {
      dgConn.send(chunk);
    } catch {
      // Deepgram connection may be in closing state — ignore silently
    }
  });

  /* ── Deepgram: close session on explicit stop ── */
  socket.on("transcribe-stop", () => {
    dgConn = closeDG(dgConn);
    console.log(`[SPABLA][DG] Transcripción detenida por ${socket.id}`);
  });

  /* ── cleanup on socket disconnect ── */
  socket.on("disconnect", () => {
    dgConn = closeDG(dgConn);
    console.log("[SPABLA] Usuario desconectado:", socket.id);
  });
});

/* ─── start ──────────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log("[SPABLA] Servidor de señalización en puerto", PORT);
});
