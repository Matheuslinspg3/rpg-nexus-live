import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://rpg-nexus-live.janeebraden7222.chatgpt.site"),
  title: "RPG Nexus",
  description: "Campanhas de RPG com ficha compartilhada, presença e edição simultânea.",
  openGraph: {
    title: "RPG Nexus",
    description: "Sua campanha. Uma ficha viva.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "RPG Nexus - Sua campanha. Uma ficha viva." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RPG Nexus",
    description: "Sua campanha. Uma ficha viva.",
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
