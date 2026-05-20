"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { io } from "socket.io-client";
import { GLOTConnection } from "@/lib/webrtc";

const ROOM_ID = "glot-demo";

export default function CallPage() {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const glotRef = useRef<GLOTConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const [subtitle, setSubtitle] = useState("Los subtitulos apareceran aqui cuando empiece la llamada...");
  const [listening, setListening] = useState(false);

  function startSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "es-ES";

    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setSubtitle(text);
    };

    recognition.onerror = (event: any) => {
      console.error("[GLOT] Speech error:", event.error);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }

  function stopSpeechRecognition() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  useEffect(() => {
    const socket = io("http://localhost:3001");
    const glot = new GLOTConnection();
    glotRef.current = glot;
    const pc = glot.getConnection();
    let remoteUserId: string | null = null;

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && remoteUserId) {
        socket.emit("ice-candidate", { to: remoteUserId, candidate: event.candidate });
      }
    };

    async function start() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      glot.addLocalStream(stream);
      socket.emit("join-room", ROOM_ID);
    }

    socket.on("user-joined", async (userId: string) => {
      remoteUserId = userId;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { to: userId, offer });
    });

    socket.on("offer", async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
      remoteUserId = from;
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { to: from, answer });
    });

    socket.on("answer", async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      await pc.setRemoteDescription(answer);
    });

    socket.on("ice-candidate", async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      await pc.addIceCandidate(candidate);
    });

    start();

    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      glot.close();
      socket.disconnect();
      stopSpeechRecognition();
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <img src="/LOGO GLOT BLUE.png" alt="GLOT" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Sala:</span>
          <span className="text-sm font-mono bg-gray-800 px-3 py-1 rounded-lg text-gray-200">{ROOM_ID}</span>
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-400">En linea</span>
        </div>
      </nav>
      <main className="flex flex-col flex-1 items-center justify-center gap-6 p-6">
        <div className="flex gap-4 w-full max-w-5xl">
          <div className="flex-1 aspect-video bg-gray-900 rounded-2xl overflow-hidden relative shadow-lg">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs font-medium text-white">Tu</span>
            </div>
          </div>
          <div className="flex-1 aspect-video bg-gray-900 rounded-2xl overflow-hidden relative shadow-lg">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-gray-500" />
              <span className="text-xs font-medium text-gray-400">Participante</span>
            </div>
          </div>
        </div>
        <div className="w-full max-w-5xl bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 min-h-20 flex flex-col gap-1 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 font-medium uppercase tracking-widest">Subtitulos</span>
            {listening && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Escuchando
              </span>
            )}
          </div>
          <p className={`text-sm ${listening ? "text-white" : "text-gray-500 italic"}`}>
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 shadow-lg">
          <button className="flex flex-col items-center gap-1 bg-gray-800 hover:bg-gray-700 transition-colors px-5 py-3 rounded-xl">
            <span className="text-lg">🎤</span>
            <span className="text-xs text-gray-400">Microfono</span>
          </button>
          <button className="flex flex-col items-center gap-1 bg-gray-800 hover:bg-gray-700 transition-colors px-5 py-3 rounded-xl">
            <span className="text-lg">📷</span>
            <span className="text-xs text-gray-400">Camara</span>
          </button>
          <button
            onClick={listening ? stopSpeechRecognition : startSpeechRecognition}
            className={`flex flex-col items-center gap-1 transition-colors px-5 py-3 rounded-xl ${listening ? "bg-green-600 hover:bg-green-500" : "bg-gray-800 hover:bg-gray-700"}`}
          >
            <span className="text-lg">💬</span>
            <span className="text-xs text-gray-400">Subtitulos</span>
          </button>
          <div className="w-px h-10 bg-gray-700 mx-1" />
          <button className="flex flex-col items-center gap-1 bg-red-600 hover:bg-red-500 transition-colors px-5 py-3 rounded-xl">
            <span className="text-lg">📵</span>
            <span className="text-xs text-red-200">Colgar</span>
          </button>
        </div>
      </main>
    </div>
  );
}
