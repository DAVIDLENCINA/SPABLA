"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { GLOTConnection } from "@/lib/webrtc";

async function translate(text: string, from: string, to: string): Promise<string> {
  if (!text.trim()) return "";
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
    );
    const data = await res.json();
    return data.responseData.translatedText || text;
  } catch {
    return text;
  }
}

export default function CallPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const glotRef = useRef<GLOTConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const [subtitle, setSubtitle] = useState("Los subtitulos apareceran aqui cuando empiece la llamada...");
  const [listening, setListening] = useState(false);
  const [fromLang, setFromLang] = useState("es");
  const [toLang, setToLang] = useState("en");
  const [copied, setCopied] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleMic() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setMicOn((p) => !p);
  }

  function toggleCam() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setCamOn((p) => !p);
  }

 function hangUp() {
  localStreamRef.current?.getTracks().forEach((t) => t.stop());
  localStreamRef.current = null;
  glotRef.current?.close();
  glotRef.current = null;
  recognitionRef.current?.stop();
  window.location.href = "/";
}
  

  function startSpeechRecognition() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = fromLang === "es" ? "es-ES" : fromLang === "en" ? "en-US" : fromLang === "fr" ? "fr-FR" : "de-DE";
    r.onresult = async (e: any) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
      setSubtitle(fromLang !== toLang ? await translate(text, fromLang, toLang) : text);
    };
    r.onerror = (e: any) => console.error("[SPABLA]", e.error);
    r.start();
    recognitionRef.current = r;
    setListening(true);
  }

  function stopSpeechRecognition() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  useEffect(() => {
    if (!roomId) return;
    const socket = io("https://spabla-production.up.railway.app");
    const glot = new GLOTConnection();
    glotRef.current = glot;
    const pc = glot.getConnection();
    let remoteUserId: string | null = null;

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && remoteUserId) socket.emit("ice-candidate", { to: remoteUserId, candidate: e.candidate });
    };

    async function start() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      glot.addLocalStream(stream);
      socket.emit("join-room", roomId);
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
      recognitionRef.current?.stop();
    };
  }, [roomId]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <img src="/LOGOTIPO_SPABLA.png" alt="SPABLA" className="h-10 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Sala:</span>
          <span className="text-sm font-mono bg-gray-800 px-3 py-1 rounded-lg text-gray-200">{roomId}</span>
          <button onClick={copyLink} className="text-xs bg-gray-800 hover:bg-gray-700 transition-colors px-3 py-1 rounded-lg text-gray-300">
            {copied ? "Copiado!" : "Copiar enlace"}
          </button>
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-400">En linea</span>
        </div>
      </nav>
      <main className="flex flex-col flex-1 items-center justify-center gap-6 p-6">
        <div className="flex gap-4 w-full max-w-5xl">
          <div className="flex-1 aspect-video bg-gray-900 rounded-2xl overflow-hidden relative shadow-lg">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            {!camOn && (
              <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                <span className="text-gray-600 text-sm">Camara apagada</span>
              </div>
            )}
            <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-xl">
              <div className={`w-2 h-2 rounded-full ${micOn ? "bg-green-400" : "bg-red-400"}`} />
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
        <div className="w-full max-w-5xl bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 min-h-20 flex flex-col gap-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 font-medium uppercase tracking-widest">Subtitulos</span>
            <div className="flex items-center gap-2">
              <select value={fromLang} onChange={(e) => setFromLang(e.target.value)} className="bg-gray-800 text-xs text-gray-300 px-2 py-1 rounded-lg border border-gray-700">
                <option value="es">Espanol</option>
                <option value="en">Ingles</option>
                <option value="fr">Frances</option>
                <option value="de">Aleman</option>
              </select>
              <span className="text-gray-600 text-xs">to</span>
              <select value={toLang} onChange={(e) => setToLang(e.target.value)} className="bg-gray-800 text-xs text-gray-300 px-2 py-1 rounded-lg border border-gray-700">
                <option value="en">Ingles</option>
                <option value="es">Espanol</option>
                <option value="fr">Frances</option>
                <option value="de">Aleman</option>
              </select>
              {listening && (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Escuchando
                </span>
              )}
            </div>
          </div>
          <p className={`text-sm ${listening ? "text-white" : "text-gray-500 italic"}`}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 shadow-lg">
          <button onClick={toggleMic} className={`flex flex-col items-center gap-1 transition-colors px-5 py-3 rounded-xl ${micOn ? "bg-gray-800 hover:bg-gray-700" : "bg-red-900 hover:bg-red-800"}`}>
            <span className="text-lg">{micOn ? "mic" : "mute"}</span>
            <span className="text-xs text-gray-400">{micOn ? "Silenciar" : "Activar mic"}</span>
          </button>
          <button onClick={toggleCam} className={`flex flex-col items-center gap-1 transition-colors px-5 py-3 rounded-xl ${camOn ? "bg-gray-800 hover:bg-gray-700" : "bg-red-900 hover:bg-red-800"}`}>
            <span className="text-lg">{camOn ? "cam" : "off"}</span>
            <span className="text-xs text-gray-400">{camOn ? "Camara" : "Sin camara"}</span>
          </button>
          <button onClick={listening ? stopSpeechRecognition : startSpeechRecognition} className={`flex flex-col items-center gap-1 transition-colors px-5 py-3 rounded-xl ${listening ? "bg-green-600 hover:bg-green-500" : "bg-gray-800 hover:bg-gray-700"}`}>
            <span className="text-lg">CC</span>
            <span className="text-xs text-gray-400">Subtitulos</span>
          </button>
          <div className="w-px h-10 bg-gray-700 mx-1" />
          <button onClick={hangUp} className="flex flex-col items-center gap-1 bg-red-600 hover:bg-red-500 transition-colors px-5 py-3 rounded-xl">
            <span className="text-lg">X</span>
            <span className="text-xs text-red-200">Colgar</span>
          </button>
        </div>
      </main>
    </div>
  );
}
