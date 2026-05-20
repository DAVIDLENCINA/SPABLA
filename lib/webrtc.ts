const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

export class GLOTConnection {
  private pc: RTCPeerConnection;

  constructor() {
    this.pc = new RTCPeerConnection(ICE_SERVERS);
    console.log("[GLOT] RTCPeerConnection creada");
  }

  addLocalStream(stream: MediaStream): void {
    stream.getTracks().forEach((track) => {
      this.pc.addTrack(track, stream);
    });
    console.log("[GLOT] Stream local añadido");
  }

  getConnection(): RTCPeerConnection {
    return this.pc;
  }

  close(): void {
    this.pc.close();
    console.log("[GLOT] Conexión cerrada");
  }
}