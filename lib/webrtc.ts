const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export class GLOTConnection {
  private pc: RTCPeerConnection;

  constructor() {
    this.pc = new RTCPeerConnection(ICE_SERVERS);
    console.log("[SPABLA] RTCPeerConnection creada");
  }

  addLocalStream(stream: MediaStream): void {
    if (!this.pc) return;

    if (
      this.pc.signalingState === "closed" ||
      this.pc.connectionState === "closed" ||
      this.pc.connectionState === "failed"
    ) {
      console.warn("[SPABLA] PeerConnection no disponible", {
        signalingState: this.pc.signalingState,
        connectionState: this.pc.connectionState,
      });
      return;
    }

    const existingTrackIds = new Set(
      this.pc
        .getSenders()
        .map((sender) => sender.track?.id)
        .filter(Boolean)
    );

    stream.getTracks().forEach((track) => {
      if (existingTrackIds.has(track.id)) return;

      try {
        this.pc.addTrack(track, stream);
      } catch (error) {
        console.warn("[SPABLA] Error añadiendo track", error);
      }
    });

    console.log("[SPABLA] Stream local añadido");
  }

  getConnection(): RTCPeerConnection {
    return this.pc;
  }

  close(): void {
    this.pc.close();
    console.log("[SPABLA] Conexión cerrada");
  }
}