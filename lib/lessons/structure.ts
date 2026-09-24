import type { ObjectiveStatus } from "@/lib/db/enums";
import type { PlannedActivity } from "@/schemas/lesson-plan";
import type { ActivityType } from "@/lib/db/enums";

export type StructureObjective = { id: string; title: string; status: ObjectiveStatus; skillId?: string | null };

/**
 * Declarative activity templates keyed on the primary objective's status
 * (architecture 05, step 11). Pure. Content is the AI's or the parent's job;
 * this decides only what kind of activity happens, against which objective,
 * for how long.
 */
type Template = Array<{ type: ActivityType; weight: number; target: "PRIMARY" | "REVIEW"; evidence: number | null; instructions: (o: StructureObjective) => string }>;

const NEW_MATERIAL: Template = [
  { type: "REVIEW", weight: 2, target: "REVIEW", evidence: 3, instructions: (o) => `Aquecimento com "${o.title}": três perguntas rápidas que a criança já conhece.` },
  { type: "EXPLANATION", weight: 3, target: "PRIMARY", evidence: 0, instructions: (o) => `Apresente "${o.title}": mostre, fale e deixe a criança repetir. Ainda sem avaliar.` },
  { type: "PRACTICE", weight: 6, target: "PRIMARY", evidence: 5, instructions: (o) => `Prática guiada de "${o.title}": cinco perguntas, corrija com gentileza e registre cada tentativa.` },
  { type: "GAME", weight: 5, target: "PRIMARY", evidence: 3, instructions: (o) => `Um jogo que use "${o.title}" de forma natural. Registre o que a criança produziu sozinha.` },
  { type: "ASSESSMENT", weight: 4, target: "PRIMARY", evidence: 3, instructions: (o) => `Desafio rápido de "${o.title}": três perguntas sem ajuda. Registre com honestidade.` },
];

const CONSOLIDATION: Template = [
  { type: "REVIEW", weight: 2, target: "REVIEW", evidence: 3, instructions: (o) => `Revisão rápida de "${o.title}": três perguntas.` },
  { type: "PRACTICE", weight: 6, target: "PRIMARY", evidence: 6, instructions: (o) => `Pratique "${o.title}" variando: troque os objetos, as pessoas ou o lugar a cada vez. Seis tentativas.` },
  { type: "CONVERSATION", weight: 6, target: "PRIMARY", evidence: 4, instructions: (o) => `Uma conversa curta em que "${o.title}" apareça naturalmente. Registre as tentativas que perceber.` },
  { type: "ASSESSMENT", weight: 6, target: "PRIMARY", evidence: 5, instructions: (o) => `Desafio de "${o.title}": cinco perguntas sem ajuda.` },
];

const RETENTION: Template = [
  { type: "REVIEW", weight: 3, target: "REVIEW", evidence: 3, instructions: (o) => `Revise "${o.title}": três perguntas.` },
  { type: "ASSESSMENT", weight: 9, target: "PRIMARY", evidence: 6, instructions: (o) => `Confira se "${o.title}" ficou na memória: faz tempo que não é praticado. Seis perguntas, sem ajuda, registre com honestidade.` },
  { type: "GAME", weight: 8, target: "PRIMARY", evidence: 3, instructions: (o) => `Termine com um jogo usando "${o.title}", para o desafio acabar num clima bom.` },
];

export function templateFor(status: ObjectiveStatus): Template {
  if (status === "NOT_STARTED" || status === "INTRODUCED") return NEW_MATERIAL;
  if (status === "PROFICIENT" || status === "MASTERED") return RETENTION;
  return CONSOLIDATION;
}

export function buildLessonStructure(primary: StructureObjective, reviews: StructureObjective[], totalMinutes: number): PlannedActivity[] {
  const template = templateFor(primary.status);
  const usable = template.filter((t) => t.target === "PRIMARY" || reviews.length > 0);
  const totalWeight = usable.reduce((a, t) => a + t.weight, 0);
  let sequence = 0;
  let allocated = 0;
  const out: PlannedActivity[] = [];
  usable.forEach((t, i) => {
    const target = t.target === "REVIEW" ? reviews[0] : primary;
    const isLast = i === usable.length - 1;
    const minutes = isLast ? Math.max(1, totalMinutes - allocated) : Math.max(1, Math.round((t.weight / totalWeight) * totalMinutes));
    allocated += minutes;
    out.push({
      sequence: ++sequence,
      activity_type: t.type,
      objective_id: target.id,
      skill_id: target.skillId ?? null,
      instructions: t.instructions(target),
      expected_evidence_count: t.evidence,
      planned_minutes: minutes,
    });
  });
  return out;
}
