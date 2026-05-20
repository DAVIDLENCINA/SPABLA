"use client";

import { useRouter } from "next/navigation";

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

export default function Home() {
  const router = useRouter();

  function handleNewCall() {
    const roomId = generateRoomId();
    router.push(`/call/${roomId}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-950">
      <img src="/LOGOTIPO_GLOT.png" alt="GLOT" className="h-16 w-auto" />
      <p className="text-gray-400 text-lg">
        Habla tu idioma. Entiende el mundo.
      </p>
      <button
        onClick={handleNewCall}
        className="bg-blue-600 hover:bg-blue-500 transition-colors px-6 py-3 rounded-xl font-semibold text-white"
      >
        Nueva llamada
      </button>
    </main>
  );
}
