import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { EvidenceResult } from "@/lib/db/enums";
import type { PlannedActivity } from "@/schemas/lesson-plan";
import { computePlacementResult, placementOf, PLACEMENT_POLICY, type PlacementResult } from "@/lib/learning/placement";
import { effectiveEvidence } from "@/lib/learning/evidence-view";

/**
 * The level check as a lesson: a short welcome, then one quick challenge per
 * unit, easiest first, each on the unit's first objective. It teaches
 * nothing. When it completes, the result is stored on the enrolment as a
 * suggestion; the family confirms where to start.
 */
export type PlacementProbe = { unit_key: string; unit_name: string; objective_id: string; objective_title: string };

export function placementInstructions(probe: PlacementProbe): string {
  return `Teste de nível, módulo "${probe.unit_name}": ${PLACEMENT_POLICY.probesPerUnit} perguntas rápidas sobre "${probe.objective_title}", sem ensinar antes e sem corrigir. Só incentive. Se ela não souber nada em dois módulos seguidos, pare o teste com carinho: o resto fica para as aulas.`;
}

export function buildPlacementStructure(probes: PlacementProbe[]): PlannedActivity[] {
  return [
    {
      sequence: 1,
      activity_type: "ORIENTATION",
      objective_id: probes[0]?.objective_id ?? null,
      skill_id: null,
      instructions: "Boas-vindas ao teste de nível: explique que são perguntinhas para o Lumi saber por onde começar, que tudo bem não saber e que não vale nota. Nada de ensinar ou corrigir.",
      expected_evidence_count: 0,
      planned_minutes: 2,
    },
    ...probes.map((p, i) => ({
      sequence: i + 2,
      activity_type: "ASSESSMENT" as const,
      objective_id: p.objective_id,
      skill_id: null,
      instructions: placementInstructions(p),
      expected_evidence_count: PLACEMENT_POLICY.probesPerUnit,
      planned_minutes: 2,
    })),
  ];
}

/**
 * Called when a lesson completes, in the same transaction. For a level-check
 * lesson, scores each probed unit from the lesson's evidence and stores the
 * suggestion on the enrolment for the family to confirm. Other lessons: no-op.
 */
export async function recordPlacementResultIfAny(tx: DbOrTx, lesson: s.LessonRow, now: Date): Promise<PlacementResult | null> {
  const probes = (lesson.planPayload as { placement_test?: { units?: PlacementProbe[] } | null }).placement_test?.units;
  if (!probes?.length) return null;
  const [activities, evidence, enrolment] = await Promise.all([
    tx.query.lessonActivities.findMany({ where: eq(s.lessonActivities.lessonId, lesson.id) }),
    tx.query.learningEvidence.findMany({ where: eq(s.learningEvidence.lessonId, lesson.id) }),
    tx.query.studentSubjects.findFirst({ where: and(eq(s.studentSubjects.studentId, lesson.studentId), eq(s.studentSubjects.subjectId, lesson.subjectId)) }),
  ]);
  if (!enrolment) return null;
  // Corrections and retractions made by the family count, as everywhere else.
  const activityOf = new Map(evidence.map((e) => [e.id, e.activityId]));
  const effective = effectiveEvidence(
    evidence.map((r) => ({ id: r.id, lessonId: r.lessonId, result: r.result as EvidenceResult, evidenceType: r.evidenceType, gradedBy: r.gradedBy, confidence: r.confidence, supersedesEvidenceId: r.supersedesEvidenceId, errorTags: r.errorTags, occurredAt: r.occurredAt })),
  );
  const units = probes.map((p) => {
    const activityIds = new Set(activities.filter((a) => a.activityType === "ASSESSMENT" && a.objectiveId === p.objective_id).map((a) => a.id));
    const results = effective.filter((e) => {
      const activityId = activityOf.get(e.id) ?? activityOf.get(e.supersedesEvidenceId ?? "");
      return activityId && activityIds.has(activityId);
    }).map((e) => e.result);
    return { unit_key: p.unit_key, unit_name: p.unit_name, results };
  });
  const result = computePlacementResult(units, lesson.id, now);
  const current = placementOf(enrolment.metadata);
  const placement = { ...(current ?? { policy_version: PLACEMENT_POLICY.version, method: "TEST" as const, start_unit_key: null, decided_at: now.toISOString() }), status: "RESULT_READY" as const, result };
  await tx
    .update(s.studentSubjects)
    .set({ metadata: { ...(enrolment.metadata as Record<string, unknown>), placement } })
    .where(eq(s.studentSubjects.id, enrolment.id));
  return result;
}
