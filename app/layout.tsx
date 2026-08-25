import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://rpg-nexus-live.vercel.app"),
  title: "Cianna's Stage",
  description: "Planeta Cianna · Madruga do RPG. Campanhas com ficha compartilhada, presença e edição simultânea.",
  openGraph: {
    title: "Cianna's Stage",
    description: "Planeta Cianna. Um palco vivo.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Cianna's Stage - Planeta Cianna. Um palco vivo." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cianna's Stage",
    description: "Planeta Cianna. Um palco vivo.",
    images: ["/og.png"],
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
