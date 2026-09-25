import { z } from "zod";
import type { EvidenceResult } from "@/lib/db/enums";

/**
 * Where a child starts in a curriculum. Asked, never assumed: at enrolment
 * the family says whether the child is starting from zero (BEGINNER: the
 * first unit), has some experience (TEST: a short level check runs as the
 * first lesson and suggests a starting unit), or picks the track themselves
 * (CHOSEN). A suggested start is applied only when the family confirms it.
 *
 * Units before the start unit are "placed out": the planner does not teach
 * them and treats their objectives as met prerequisites. Nothing is written
 * to the evidence ledger or the objective states to achieve that.
 */
export const PLACEMENT_POLICY = { version: "placement.v1", passThreshold: 0.75, probesPerUnit: 2, maxUnits: 8 } as const;

export const PLACEMENT_METHODS = ["BEGINNER", "TEST", "CHOSEN"] as const;
export type PlacementMethod = (typeof PLACEMENT_METHODS)[number];

const unitScoreSchema = z.object({ unit_key: z.string(), unit_name: z.string(), assessed: z.number().int().min(0), score: z.number().min(0).max(1).nullable(), passed: z.boolean() });
const placementResultSchema = z.object({
  lesson_id: z.string(),
  units: z.array(unitScoreSchema),
  suggested_start_unit_key: z.string().nullable(),
  all_passed: z.boolean(),
  computed_at: z.string(),
});
export const placementSchema = z.object({
  policy_version: z.string(),
  method: z.enum(PLACEMENT_METHODS),
  /** PENDING_TEST: the next lesson is the level check. RESULT_READY: waiting for the family to confirm. SET: in use. */
  status: z.enum(["PENDING_TEST", "RESULT_READY", "SET"]),
  start_unit_key: z.string().nullable(),
  decided_at: z.string(),
  result: placementResultSchema.nullable().default(null),
});
export type Placement = z.infer<typeof placementSchema>;
export type PlacementResult = z.infer<typeof placementResultSchema>;

/** The placement stored on an enrolment, if any. Enrolments made before placements existed have none. */
export function placementOf(metadata: unknown): Placement | null {
  const raw = (metadata as { placement?: unknown } | null)?.placement;
  const parsed = placementSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function newPlacement(method: PlacementMethod, now: Date, startUnitKey: string | null = null): Placement {
  return { policy_version: PLACEMENT_POLICY.version, method, status: method === "TEST" ? "PENDING_TEST" : "SET", start_unit_key: startUnitKey, decided_at: now.toISOString(), result: null };
}

/** Units the child skips: every unit before the confirmed start unit. */
export function placedOutUnitKeys(unitKeysInOrder: string[], placement: Placement | null): Set<string> {
  if (!placement || placement.status !== "SET" || !placement.start_unit_key) return new Set();
  const at = unitKeysInOrder.indexOf(placement.start_unit_key);
  return new Set(at > 0 ? unitKeysInOrder.slice(0, at) : []);
}

/** The level check samples each unit through its first objective, easiest unit first. */
export function placementProbes<T extends { unitKey: string }>(objectivesInOrder: T[]): T[] {
  const seen = new Set<string>();
  const probes: T[] = [];
  for (const o of objectivesInOrder) {
    if (seen.has(o.unitKey)) continue;
    seen.add(o.unitKey);
    probes.push(o);
    if (probes.length >= PLACEMENT_POLICY.maxUnits) break;
  }
  return probes;
}

/**
 * Scores each probed unit (correct 1, partial 0.5, wrong 0, not assessed
 * ignored) and suggests starting at the first unit not passed. A unit with no
 * assessed attempt counts as not passed: the check stopped before it.
 */
export function computePlacementResult(units: Array<{ unit_key: string; unit_name: string; results: EvidenceResult[] }>, lessonId: string, now: Date, partialCredit = 0.5): PlacementResult {
  const scored = units.map((u) => {
    const assessed = u.results.filter((r) => r !== "NOT_ASSESSED");
    const score = assessed.length ? assessed.reduce((a, r) => a + (r === "CORRECT" ? 1 : r === "PARTIALLY_CORRECT" ? partialCredit : 0), 0) / assessed.length : null;
    return { unit_key: u.unit_key, unit_name: u.unit_name, assessed: assessed.length, score: score === null ? null : Math.round(score * 100) / 100, passed: score !== null && score >= PLACEMENT_POLICY.passThreshold };
  });
  const firstMiss = scored.find((u) => !u.passed);
  return { lesson_id: lessonId, units: scored, suggested_start_unit_key: firstMiss?.unit_key ?? null, all_passed: !firstMiss && scored.length > 0, computed_at: now.toISOString() };
}
