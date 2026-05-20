"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function CallPage() {
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("No se pudo acceder a la cámara:", error);
      }
    }

    startCamera();

    return () => {
      if (localVideoRef.current?.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">

      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800">

        {/* Branding */}
        <Link
          href="/"
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          {/* Logo AZUL original */}
          <img
            src="/LOGO GLOT BLUE.png"
            alt="GLOT"
            className="h-10 w-auto"
          />

          {/* Texto BLANCO */}
          <span className="text-3xl font-bold tracking-tight text-white">
            GLOT
          </span>
        </Link>

        {/* Estado */}
        <div className="flex items-center gap-3">

          <span className="text-sm text-gray-400">
            Sala:
          </span>

          <span className="text-sm font-mono bg-gray-800 px-3 py-1 rounded-lg text-gray-200">
            glot-demo
          </span>

          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />

          <span className="text-xs text-green-400">
            En línea
          </span>

        </div>
      </nav>

      {/* Área principal */}
      <main className="flex flex-col flex-1 items-center justify-center gap-6 p-6">

        {/* Paneles de vídeo */}
        <div className="flex gap-4 w-full max-w-5xl">

          {/* Tu cámara */}
          <div className="flex-1 aspect-video bg-gray-900 rounded-3xl overflow-hidden relative border border-gray-800 shadow-2xl">

            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />

            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-sm flex items-center gap-2">

              <div className="w-2 h-2 rounded-full bg-green-400" />

              Tú

            </div>
          </div>

          {/* Participante fake */}
          <div className="flex-1 aspect-video bg-gray-900 rounded-3xl border border-gray-800 flex flex-col items-center justify-center relative shadow-2xl">

            <div className="w-16 h-16 rounded-full bg-blue-950 flex items-center justify-center text-3xl text-gray-400 mb-4">
              👤
            </div>

            <p className="text-gray-500">
              Esperando participante...
            </p>

            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-sm">
              Participante
            </div>
          </div>
        </div>

        {/* Subtítulos */}
        <div className="w-full max-w-5xl bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl">

          <div className="flex items-center justify-between mb-4">

            <h3 className="text-lg font-semibold text-gray-200">
              Subtítulos
            </h3>

            <span className="text-xs text-gray-500">
              Traducción en tiempo real
            </span>

          </div>

          <div className="bg-black/30 rounded-2xl p-4 min-h-[80px] flex items-center">

            <p className="text-gray-500 italic">
              Los subtítulos aparecerán aquí cuando empiece la llamada...
            </p>

          </div>
        </div>

        {/* Controles */}
        <div className="flex items-center gap-4 bg-gray-900 border border-gray-800 px-6 py-4 rounded-3xl shadow-2xl">

          <button className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 transition-colors px-6 py-4 rounded-2xl min-w-[90px]">

            <span className="text-2xl">
              🎤
            </span>

            <span className="text-sm text-gray-300">
              Micrófono
            </span>

          </button>

          <button className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 transition-colors px-6 py-4 rounded-2xl min-w-[90px]">

            <span className="text-2xl">
              📷
            </span>

            <span className="text-sm text-gray-300">
              Cámara
            </span>

          </button>

          <button className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 transition-colors px-6 py-4 rounded-2xl min-w-[90px]">

            <span className="text-2xl">
              💬
            </span>

            <span className="text-sm text-gray-300">
              Subtítulos
            </span>

          </button>

          <div className="w-px h-12 bg-gray-700" />

          <button className="flex flex-col items-center gap-2 bg-red-600 hover:bg-red-500 transition-colors px-6 py-4 rounded-2xl min-w-[90px]">

            <span className="text-2xl">
              🚫
            </span>

            <span className="text-sm text-white">
              Colgar
            </span>

          </button>

        </div>
      </main>
    </div>
  );
