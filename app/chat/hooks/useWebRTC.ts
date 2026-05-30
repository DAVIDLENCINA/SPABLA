import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "https://spabla-server.onrender.com";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80",              username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443",             username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

export type WebRTCState = {
  localStream:  MediaStream | null;
  remoteStream: MediaStream | null;
  connected:    boolean;   // socket conectado al servidor
  hasRemote:    boolean;   // hay otro participante
  micOn:        boolean;
  camOn:        boolean;
  error:        string | null;
  startCall:    () => Promise<void>;
  endCall:      () => void;
  toggleMic:    () => void;
  toggleCam:    () => void;
};

export function useWebRTC(conversationId: string | null): WebRTCState {
  const socketRef      = useRef<Socket | null>(null);
  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [localStream,  setLocalStream]  = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connected,    setConnected]    = useState(false);
  const [hasRemote,    setHasRemote]    = useState(false);
  const [micOn,        setMicOn]        = useState(true);
  const [camOn,        setCamOn]        = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  const endCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    socketRef.current?.disconnect();
    pcRef.current?.close();
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setHasRemote(false);
    setConnected(false);
  }, []);

  const startCall = useCallback(async () => {
    if (socketRef.current?.connected) return; // ya activa
    if (!conversationId) return;              // sin conversación activa no hay sala

    setError(null);

    // 1 — Media
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (err: any) {
      setError(`Sin acceso a cámara/micrófono: ${err?.name} — ${err?.message}`);
      return;
    }
    localStreamRef.current = stream;
    setLocalStream(stream);
    setMicOn(true);
    setCamOn(true);

    // 2 — PeerConnection
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
      setHasRemote(true);
    };

    // 3 — Socket signaling
    const socket = io(SERVER_URL, { transports: ["polling", "websocket"] });
    socketRef.current = socket;

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit("ice-candidate", { roomId: conversationId, candidate: e.candidate });
    };

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-room", conversationId);
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("user-joined", async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { roomId: conversationId, offer });
    });

    socket.on("offer", async (d: { offer: RTCSessionDescriptionInit }) => {
      await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { roomId: conversationId, answer });
    });

    socket.on("answer", async (d: { answer: RTCSessionDescriptionInit }) => {
      await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
    });

    socket.on("ice-candidate", async (d: { candidate: RTCIceCandidateInit }) => {
      try { await pc.addIceCandidate(d.candidate); } catch {}
    });
  }, [conversationId]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; setMicOn(t.enabled); });
  }, []);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; setCamOn(t.enabled); });
  }, []);

  // Limpiar al desmontar
  useEffect(() => () => endCall(), [endCall]);

  return { localStream, remoteStream, connected, hasRemote, micOn, camOn, error, startCall, endCall, toggleMic, toggleCam };
}
