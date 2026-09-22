import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Learning OS",
  description: "Learning based on evidence, not chatbot memory.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
