import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: { origin: "http://localhost:3000" },
});

io.on("connection", (socket) => {
  console.log("[GLOT] Usuario conectado:", socket.id);

  socket.on("join-room", (roomId: string) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", socket.id);
    console.log(`[GLOT] ${socket.id} entró en sala: ${roomId}`);
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

  socket.on("disconnect", () => {
    console.log("[GLOT] Usuario desconectado:", socket.id);
  });
});

httpServer.listen(3001, () => {
  console.log("[GLOT] Servidor de señalización en puerto 3001");
});