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
  { type: "REVIEW", weight: 2, target: "REVIEW", evidence: 3, instructions: (o) => `Warm up with "${o.title}": three quick prompts the child has seen before.` },
  { type: "EXPLANATION", weight: 3, target: "PRIMARY", evidence: 0, instructions: (o) => `Introduce "${o.title}". Show it, say it, let the child repeat. No testing yet.` },
  { type: "PRACTICE", weight: 6, target: "PRIMARY", evidence: 5, instructions: (o) => `Guided practice of "${o.title}": five prompts, correct gently, record each attempt.` },
  { type: "GAME", weight: 5, target: "PRIMARY", evidence: 3, instructions: (o) => `A game that uses "${o.title}" naturally. Record what the child produced unprompted.` },
  { type: "ASSESSMENT", weight: 4, target: "PRIMARY", evidence: 3, instructions: (o) => `Short check of "${o.title}": three prompts without help. Record honestly.` },
];

const CONSOLIDATION: Template = [
  { type: "REVIEW", weight: 2, target: "REVIEW", evidence: 3, instructions: (o) => `Quick review of "${o.title}": three prompts.` },
  { type: "PRACTICE", weight: 6, target: "PRIMARY", evidence: 6, instructions: (o) => `Practice "${o.title}" with variety: change the objects, people or setting each time. Six attempts.` },
  { type: "CONVERSATION", weight: 6, target: "PRIMARY", evidence: 4, instructions: (o) => `A short conversation where "${o.title}" comes up naturally. Record the attempts you notice.` },
  { type: "ASSESSMENT", weight: 6, target: "PRIMARY", evidence: 5, instructions: (o) => `Check of "${o.title}": five prompts without help.` },
];

const RETENTION: Template = [
  { type: "REVIEW", weight: 3, target: "REVIEW", evidence: 3, instructions: (o) => `Review "${o.title}": three prompts.` },
  { type: "ASSESSMENT", weight: 9, target: "PRIMARY", evidence: 6, instructions: (o) => `Retention check of "${o.title}", which the child has not practised for a while. Six prompts, no help, record honestly.` },
  { type: "GAME", weight: 8, target: "PRIMARY", evidence: 3, instructions: (o) => `Finish with a game using "${o.title}" so the check ends on a good note.` },
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
