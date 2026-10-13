import type { ActivityType } from "@/lib/db/enums";

/**
 * Child-facing words in Spanish, for literacy lessons taught in Spanish.
 * Adult screens stay in Portuguese; only what the child sees and hears changes.
 */
export const KID_ACTIVITY_ES: Record<ActivityType, string> = {
  REVIEW: "¡Nivel recuerdo!",
  EXPLANATION: "¡Letra nueva!",
  PRACTICE: "¡A practicar!",
  GAME: "¡Hora del juego!",
  CONVERSATION: "¡Charlamos!",
  ASSESSMENT: "¡El gran reto!",
  REFLECTION: "¿Qué he aprendido?",
  ORIENTATION: "¡Empieza la aventura!",
};

/** The voice lesson screen, in Spanish. Keys match the Portuguese strings in components/student/voice-lesson.tsx. */
export type VoiceScreenCopy = {
  [K in "connecting" | "paused" | "ending" | "speaking" | "listening" | "thinking" | "yourTurn" | "intro" | "start" | "again" | "startLabel" | "micHint" | "screenMode" | "pause" | "resume" | "hideCaptions" | "showCaptions" | "readHere"]: string;
} & { hello: (name: string) => string; stars: (done: number, total: number) => string; touched: (card: string) => string };

export const VOICE_SCREEN_ES: VoiceScreenCopy = {
  connecting: "Llamando a Lumi…",
  paused: "En pausa",
  ending: "¡Hasta la próxima!",
  speaking: "Lumi está hablando",
  listening: "Te estoy escuchando…",
  thinking: "Pensando…",
  yourTurn: "¡Te toca! Puedes hablar",
  hello: (name: string) => `¡Hola, ${name}!`,
  intro: "¡Hoy hay una misión en la Isla de las Letras!",
  start: "¡Vamos!",
  again: "Otra vez",
  startLabel: "Empezar la misión con Lumi",
  micHint: "Adulto: la primera vez, el navegador pide permiso para usar el micrófono.",
  screenMode: "Hacerlo en pantalla, sin voz",
  pause: "Pausar",
  resume: "Seguir",
  hideCaptions: "Ocultar subtítulos",
  showCaptions: "Mostrar subtítulos",
  stars: (done: number, total: number) => `${done} de ${total} estrellas`,
  touched: (card: string) => `(La niña o el niño toca la tarjeta: ${card})`,
  readHere: "Mira aquí",
};
