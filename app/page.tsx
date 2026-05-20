import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-950">
      <img src="/LOGOTIPO_GLOT.png" alt="GLOT" className="h-16 w-auto" />
      <p className="text-gray-400 text-lg">
        Habla tu idioma. Entiende el mundo.
      </p>
      <Link
        href="/call"
        className="bg-blue-600 hover:bg-blue-500 transition-colors px-6 py-3 rounded-xl font-semibold text-white"
      >
        Nueva llamada
      </Link>
    </main>
  );
}
