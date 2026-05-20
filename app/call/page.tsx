export default function CallPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">

      {/* Título */}
      <h2 className="text-2xl font-semibold tracking-tight text-gray-300">
        Sala de llamada
      </h2>

      {/* Área de vídeos */}
      <div className="flex gap-4 w-full max-w-4xl">

        {/* Vídeo local */}
        <div className="flex-1 aspect-video bg-gray-800 rounded-2xl flex items-center justify-center">
          <span className="text-gray-500 text-sm">Tu cámara</span>
        </div>

        {/* Vídeo remoto */}
        <div className="flex-1 aspect-video bg-gray-800 rounded-2xl flex items-center justify-center">
          <span className="text-gray-500 text-sm">Participante</span>
        </div>

      </div>

      {/* Área de subtítulos */}
      <div className="w-full max-w-4xl bg-gray-900 rounded-2xl px-6 py-4 min-h-16 flex items-center">
        <p className="text-gray-500 text-sm italic">
          Los subtítulos aparecerán aquí...
        </p>
      </div>

      {/* Controles */}
      <div className="flex gap-4">
        <button className="bg-gray-700 hover:bg-gray-600 transition-colors px-6 py-3 rounded-xl font-semibold">
          🎤 Silenciar
        </button>

        <button className="bg-red-600 hover:bg-red-500 transition-colors px-6 py-3 rounded-xl font-semibold">
          ✕ Colgar
        </button>
      </div>

    </main>
  );
}