"use client";

import { useEffect, useState } from "react";
import { speechLangOf } from "@/lib/speech/lang";

/**
 * 🔊 for the screen lesson: reads Lumi's line and the question with the
 * browser's own voices, Portuguese or English per line. No network, no cost.
 * Hidden where the browser has no speech synthesis.
 */
export function ReadAloud({ lines, label = "Ouvir" }: { lines: string[]; label?: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    // Feature detection has to wait for the browser; the server render has no speechSynthesis.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);
  if (!supported) return null;

  const speak = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const voices = synth.getVoices();
    const text = lines.map((l) => l.trim()).filter(Boolean);
    text.forEach((line, i) => {
      const u = new SpeechSynthesisUtterance(line);
      u.lang = speechLangOf(line, "pt-BR");
      u.voice = voices.find((v) => v.lang === u.lang) ?? voices.find((v) => v.lang.startsWith(u.lang.slice(0, 2))) ?? null;
      u.rate = u.lang === "en-GB" ? 0.85 : 0.95;
      if (i === 0) u.onstart = () => setSpeaking(true);
      if (i === text.length - 1) u.onend = u.onerror = () => setSpeaking(false);
      synth.speak(u);
    });
  };

  return (
    <button type="button" onClick={speak} className={`kid-btn inline-flex items-center gap-2 bg-sky px-5 py-3 text-lg text-sky-ink ${speaking ? "animate-pulse" : ""}`} aria-label={`${label} em voz alta`}>
      <span aria-hidden>🔊</span> {label}
    </button>
  );
}
