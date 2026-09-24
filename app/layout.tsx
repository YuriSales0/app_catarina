import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const nunito = localFont({
  src: "./fonts/nunito-latin-wght.woff2",
  weight: "200 1000",
  variable: "--font-nunito",
  display: "swap",
});

const fredoka = localFont({
  src: "./fonts/fredoka-latin-wght.woff2",
  weight: "300 700",
  variable: "--font-fredoka",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Learning OS · Inglês no ritmo do seu filho", template: "%s · Learning OS" },
  description: "Aulas de inglês alinhadas ao Cambridge, planejadas a partir do que a criança já demonstrou. Suave para a criança, claro para a família.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF7F0" },
    { media: "(prefers-color-scheme: dark)", color: "#17161F" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${nunito.variable} ${fredoka.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
