export default function Home() {
  return (
    <main className="min-h-screen bg-[#020817] text-white flex flex-col items-center justify-center px-6">
      
      <div className="text-center max-w-xl">
        
        <img
          src="/LOGO GLOT BLUE.png"
          alt="GLOT"
          className="w-28 mx-auto mb-8 rounded-3xl shadow-2xl"
        />

        <h1 className="text-6xl font-bold tracking-tight">
          GLOT
        </h1>

        <p className="mt-6 text-xl text-gray-400 leading-relaxed">
          Habla tu idioma.
          <br />
          Entiende el mundo.
        </p>

        <button className="mt-10 bg-blue-600 hover:bg-blue-500 transition-all px-8 py-4 rounded-2xl text-lg font-medium shadow-lg">
          Nueva llamada
        </button>

      </div>

    </main>
  );
}