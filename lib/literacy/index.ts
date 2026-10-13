import type { ContextPack } from "@/schemas/context-pack";

/**
 * Literacy mode, shared by the lesson services, the AI layer and the child's
 * screen: which subject is literacy, what the voice teacher can show, and the
 * games. Pure; no model, no database.
 */
export const LITERACY_PROMPT_VERSION = "literacy.v1" as const;

/** A curriculum belongs to literacy mode by its subject. */
export const LITERACY_SUBJECT = "literacy" as const;

export function isLiteracySubject(slug: string | null | undefined): boolean {
  return slug === LITERACY_SUBJECT;
}

export function isLiteracyPack(pack: Pick<ContextPack, "subject">): boolean {
  return isLiteracySubject(pack.subject?.slug);
}

/** What the voice teacher can put on the child's screen. Executed by the browser alone; nothing is recorded. */
export const SHOW_STYLES = ["letter", "syllable", "word", "sentence", "choice"] as const;
export type ShowStyle = (typeof SHOW_STYLES)[number];
export type ShowOnScreen = { style: ShowStyle; text: string; options: string[] };

/** Cleans what the model asked to show: short, a known style, cards only for a choice. */
export function parseShowArgs(raw: string): ShowOnScreen | null {
  let v: { style?: unknown; text?: unknown; options?: unknown };
  try {
    v = JSON.parse(raw || "{}");
  } catch {
    return null;
  }
  const style = SHOW_STYLES.includes(v.style as ShowStyle) ? (v.style as ShowStyle) : null;
  if (!style) return null;
  const text = typeof v.text === "string" ? v.text.trim().slice(0, 80) : "";
  const options = style === "choice" && Array.isArray(v.options) ? v.options.filter((o): o is string => typeof o === "string" && o.trim() !== "").map((o) => o.trim().slice(0, 24)).slice(0, 4) : [];
  if (style === "choice" ? options.length < 2 : !text) return null;
  return { style, text, options };
}

/** Voice-and-screen games for reading, in Spanish, named for the child. */
export const LITERACY_GAMES = [
  "Veo veo con sonidos: «Veo veo una cosa que empieza con mmm»",
  "Lumi se equivoca: pones una letra en pantalla y dices otro sonido; ella te corrige",
  "El tren de sílabas: la consonante se engancha a cada vocal (ma, me, mi, mo, mu)",
  "El robot que habla a trozos: dices una palabra por sílabas (pe-lo-ta) y ella la adivina",
  "Ruleta de sílabas: muestras una sílaba al azar y ella la lee lo más rápido que pueda",
  "Cazatesoros: buscar en casa algo que empiece con el sonido de hoy y volver a contarlo",
  "Tarjetas mágicas: 3 tarjetas en pantalla, ella toca o dice la que pides",
  "Verdad o mentira: lee una frase corta y dice si es verdad (El oso pela la sopa)",
] as const;

