import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY ?? "");

const ALLOWED_ORIGINS = ["https://spabla.vercel.app", "http://localhost:3000"];

const httpServer = createServer((req, res) => {
  const origin = req.headers.origin ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", ts: Date.now() }));
    return;
  }

  res.writeHead(200);
  res.end("SPABLA signaling server");
});

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
  },
  transports: ["polling", "websocket"],
});

type DGConnection = ReturnType<typeof deepgram.listen.live>;

function closeDG(conn: DGConnection | null): null {
  if (!conn) return null;
  try { conn.requestClose(); } catch { }
  return null;
}

io.on("connection", (socket: Socket) => {
  console.log("[SPABLA] Usuario conectado:", socket.id);

  let dgConn: DGConnection | null = null;

  socket.on("join-room", (roomId: string) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", socket.id);
    console.log(`[SPABLA] ${socket.id} entró en sala: ${roomId}`);
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
    roomId: string;
    originalText: string;
    translatedText: string;
    fromLang: string;
    toLang: string;
    ts: number;
  }) => {
    socket.to(data.roomId).emit("subtitle", { from: socket.id, ...data });
  });

  socket.on("transcribe-start", async ({ lang }: { lang: string }) => {
    dgConn = closeDG(dgConn);

    if (!process.env.DEEPGRAM_API_KEY) {
      console.error("[SPABLA][DG] DEEPGRAM_API_KEY no configurada");
      socket.emit("transcript-result", { text: "", isFinal: false, error: true });
      return;
    }

    try {
      dgConn = deepgram.listen.live({
        language:        lang,
        model:           "nova-2",
        encoding:        "linear16",
        sample_rate:     48000,
        channels:        1,
        interim_results: true,
        punctuate:       true,
        smart_format:    true,
        endpointing:     300,
      });

      dgConn.on(LiveTranscriptionEvents.Open, () => {
        console.log(`[SPABLA][DG] Sesión abierta: socket=${socket.id} lang=${lang}`);
      });

      dgConn.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const alt = data?.channel?.alternatives?.[0];
        if (!alt || alt.transcript === undefined) return;
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

  socket.on("audio-chunk", (chunk: ArrayBuffer) => {
    if (!dgConn) return;
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
});
