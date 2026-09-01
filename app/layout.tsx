import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPABLA",
  description: "Plataforma de conversación multilingüe en tiempo real",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0, background: "#02030A", overflowX: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
