import type { Tone } from "@/lib/copy/pt";

export type LevelInfo = { key: "starters" | "movers" | "flyers" | "other"; title: string; cefr: string | null; ageFrom: number | null; blurb: string; emoji: string; tone: Tone };

/** Family-friendly description of a curriculum, recognised by its name. Anything unknown is shown as-is. */
export function describeLevel(curriculumName: string): LevelInfo {
  const n = curriculumName.toLowerCase();
  if (n.includes("starters")) return { key: "starters", title: "Starters", cefr: "Pre A1", ageFrom: 6, blurb: "Primeiro contato: cumprimentos, cores, números, família, animais e frases curtas.", emoji: "🌱", tone: "mint" };
  if (n.includes("movers")) return { key: "movers", title: "Movers", cefr: "A1", ageFrom: 8, blurb: "Frases mais longas, rotina, passado simples, descrever pessoas e lugares.", emoji: "🚀", tone: "sky" };
  if (n.includes("flyers")) return { key: "flyers", title: "Flyers", cefr: "A2", ageFrom: 9, blurb: "Contar histórias, comparar e dar opiniões.", emoji: "🪁", tone: "lavender" };
  return { key: "other", title: curriculumName, cefr: null, ageFrom: null, blurb: "Currículo personalizado.", emoji: "📘", tone: "peach" };
}

/** The level we suggest for an age: Starters until 7, Movers from 8. */
export function suggestedLevelKey(age: number | null): LevelInfo["key"] {
  return age !== null && age >= 8 ? "movers" : "starters";
}
