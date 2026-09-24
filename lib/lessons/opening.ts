import type { EvidenceResult, ObjectiveStatus } from "@/lib/db/enums";
import { describeLevel } from "@/lib/curriculum/levels";

/**
 * Course and module openings. Pure: decided from facts the planner already
 * has, so the same history always gives the same plan.
 *
 * - COURSE_START: no completed lesson on this curriculum version yet (the
 *   very first lesson, or the first after a level change).
 * - UNIT_START: nothing in the primary objective's unit has started yet.
 *
 * An opening adds an ORIENTATION activity: how lessons work, the module's
 * goals, and a short diagnostic on the primary objective before any teaching.
 */
export type OpeningKind = "COURSE_START" | "UNIT_START";
export type Opening = { kind: OpeningKind; unit_name: string; unit_objectives: Array<{ id: string; title: string }> };

export const OPENING_DIAGNOSTIC_ITEMS = 3;
const MAX_LISTED = 8;

export function decideOpening(input: {
  completedLessonsOnVersion: number;
  unitName: string;
  unitObjectives: Array<{ id: string; title: string; status: ObjectiveStatus }>;
}): Opening | null {
  const unit_objectives = input.unitObjectives.slice(0, MAX_LISTED).map(({ id, title }) => ({ id, title }));
  if (input.completedLessonsOnVersion === 0) return { kind: "COURSE_START", unit_name: input.unitName, unit_objectives };
  if (input.unitObjectives.length > 0 && input.unitObjectives.every((o) => o.status === "NOT_STARTED")) return { kind: "UNIT_START", unit_name: input.unitName, unit_objectives };
  return null;
}

/** Instructions for the adult and, through the context pack, for the AI teacher. */
export function openingInstructions(opening: Opening, primaryTitle: string): string {
  const goals = opening.unit_objectives.map((o) => `"${o.title}"`).join(", ");
  const diagnostic = `Depois, faça ${OPENING_DIAGNOSTIC_ITEMS} perguntas rápidas sobre "${primaryTitle}" sem ensinar antes, só para ver o ponto de partida. Não corrija ainda; apenas registre.`;
  if (opening.kind === "COURSE_START") {
    return `Abertura do curso: dê as boas-vindas, explique como as aulas funcionam (uma atividade por vez, cada atividade vale uma estrela, errar faz parte de aprender) e apresente os objetivos do módulo "${opening.unit_name}": ${goals}. ${diagnostic}`;
  }
  return `Abertura do módulo "${opening.unit_name}": conte com entusiasmo o que vem neste módulo (${goals}). ${diagnostic}`;
}

/**
 * Reads the opening diagnostic and, when it says the starting point looks
 * wrong, proposes an action to the family. It never changes the level: that
 * decision is the parent's.
 */
export function placementCheck(
  opening: Opening,
  results: EvidenceResult[],
  curriculumName: string,
  partialCredit = 0.5,
): { action: string; reason: string } | null {
  const assessed = results.filter((r) => r !== "NOT_ASSESSED");
  if (assessed.length < OPENING_DIAGNOSTIC_ITEMS) return null;
  const rate = assessed.reduce((a, r) => a + (r === "CORRECT" ? 1 : r === "PARTIALLY_CORRECT" ? partialCredit : 0), 0) / assessed.length;
  const level = describeLevel(curriculumName);
  const reason = "O diagnóstico da abertura mede o ponto de partida antes de qualquer explicação. A decisão de mudar é sempre da família.";

  if (opening.kind === "COURSE_START") {
    if (rate >= 0.9) {
      const next = level.key === "starters" ? "a trilha Movers" : level.key === "movers" ? "a trilha Flyers, quando estiver disponível" : "um nível acima";
      return { action: `Acertou quase tudo no diagnóstico da abertura. O nível atual (${level.title}) pode estar fácil: considere ${next} no perfil da criança.`, reason };
    }
    if (rate <= 0.2 && level.key !== "starters" && level.key !== "other") {
      return { action: `O diagnóstico da abertura foi bem difícil. Considere começar pela trilha Starters e voltar a ${level.title} depois.`, reason };
    }
    return null;
  }
  if (rate >= 0.9) return { action: `Começou o módulo "${opening.unit_name}" já sabendo bastante. O planejador vai avançar conforme as próximas tentativas confirmarem.`, reason };
  if (rate <= 0.2) return { action: `O módulo "${opening.unit_name}" começou com dificuldade. Vale uma revisão calma do módulo anterior durante a semana.`, reason };
  return null;
}
