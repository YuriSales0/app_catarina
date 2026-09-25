import { describe, it, expect } from "vitest";
import { selectNextObjective, type EngineInput, type EngineObjective } from "@/lib/learning/engine";
import { ENGINE_POLICY_V1, ENGINE_POLICY_V2 } from "@/lib/learning/engine-policy";
import type { PrerequisiteEdge } from "@/lib/learning/prerequisites";
import type { ObjectiveStatus } from "@/lib/db/enums";
import { OBJECTIVE_STATUSES } from "@/lib/db/enums";

const NOW = new Date("2026-06-01T10:00:00Z");
const DAY = 86_400_000;

function obj(id: string, unitOrder: number, sequence: number, status: ObjectiveStatus = "NOT_STARTED", extra: Partial<EngineObjective> = {}): EngineObjective {
  return {
    id: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
    code: id,
    title: `Objective ${id}`,
    lineageId: `lineage-${id}`,
    unitKey: `U${unitOrder}`,
    unitOrder,
    sequence,
    difficulty: 1,
    unitActive: true,
    status,
    confidence: "MEDIUM",
    decidedByEvidenceIds: [],
    proficientSince: null,
    nextReviewAt: null,
    lastSuccessAt: null,
    ...extra,
  };
}
const idOf = (code: string) => `00000000-0000-4000-8000-${code.padStart(12, "0")}`;
const edge = (from: string, to: string, strength: "HARD" | "SOFT" = "HARD", requiredStatus: ObjectiveStatus = "PROFICIENT"): PrerequisiteEdge => ({
  objectiveId: idOf(to),
  prerequisiteObjectiveId: idOf(from),
  requiredStatus,
  strength,
});
const base = (objectives: EngineObjective[], edges: PrerequisiteEdge[] = [], extra: Partial<EngineInput> = {}): EngineInput => ({
  objectives,
  edges,
  recurringErrors: [],
  recentLessons: [],
  successWithinWindow: new Set(),
  now: NOW,
  hasCurriculum: true,
  ...extra,
});
const run = (input: EngineInput) => selectNextObjective(input, ENGINE_POLICY_V1);

/** Deterministic PRNG so the property test is reproducible. */
function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

describe("Next Lesson Engine", () => {
  it("picks the first objective in sequence for a brand-new student", () => {
    const d = run(base([obj("A", 0, 1), obj("B", 0, 2), obj("C", 1, 1)]));
    expect(d.outcome).toBe("PLANNED");
    expect(d.primary?.objective.code).toBe("A");
    expect(d.primary?.reasons[0]).toMatchObject({ kind: "NEXT_IN_SEQUENCE" });
  });

  it("never selects a locked objective, whatever the scores (proof 2, property test)", () => {
    const random = rng(42);
    for (let trial = 0; trial < 300; trial++) {
      const n = 3 + Math.floor(random() * 8);
      const objectives: EngineObjective[] = [];
      for (let i = 0; i < n; i++) {
        const status = OBJECTIVE_STATUSES[Math.floor(random() * OBJECTIVE_STATUSES.length)];
        objectives.push(
          obj(`O${i}`, Math.floor(i / 3), (i % 3) + 1, status, {
            nextReviewAt: random() < 0.3 ? new Date(NOW.getTime() - random() * 20 * DAY) : null,
            difficulty: 1 + Math.floor(random() * 5),
          }),
        );
      }
      const edges: PrerequisiteEdge[] = [];
      for (let i = 1; i < n; i++) {
        if (random() < 0.5) {
          const from = Math.floor(random() * i);
          edges.push(edge(`O${from}`, `O${i}`, random() < 0.8 ? "HARD" : "SOFT", random() < 0.5 ? "PROFICIENT" : "DEVELOPING"));
        }
      }
      const recurringErrors = objectives.filter(() => random() < 0.2).map((o) => ({ errorTag: "X", occurrences: 5, lessonIds: [], objectiveIds: [o.id] }));
      const d = run(base(objectives, edges, { recurringErrors }));
      if (d.outcome !== "PLANNED") continue;
      const p = d.primary!;
      expect(p.unlock.unlocked, `trial ${trial}: ${p.objective.code} selected while locked`).toBe(true);
      expect(p.objective.status).not.toBe("MASTERED");
      for (const e of edges.filter((e) => e.objectiveId === p.objective.id && e.strength === "HARD")) {
        const pre = objectives.find((o) => o.id === e.prerequisiteObjectiveId)!;
        expect(OBJECTIVE_STATUSES.indexOf(pre.status)).toBeGreaterThanOrEqual(OBJECTIVE_STATUSES.indexOf(e.requiredStatus));
      }
    }
  });

  it("is deterministic across 1000 runs and independent of input order", () => {
    const objectives = [obj("A", 0, 1, "DEVELOPING"), obj("B", 0, 2, "PRACTISING"), obj("C", 1, 1), obj("D", 1, 2, "PROFICIENT", { nextReviewAt: new Date(NOW.getTime() - 3 * DAY) })];
    const input = base(objectives, [edge("A", "C")], { recurringErrors: [{ errorTag: "T", occurrences: 4, lessonIds: [], objectiveIds: [idOf("B")] }] });
    const first = JSON.stringify(run(input));
    for (let i = 0; i < 1000; i++) expect(JSON.stringify(run(input))).toBe(first);
    const shuffled = { ...input, objectives: [...objectives].reverse(), edges: [...input.edges].reverse() };
    expect(JSON.stringify(run(shuffled))).toBe(first);
  });

  it("an overdue PROFICIENT objective outranks new material (review precedence)", () => {
    const d = run(base([obj("A", 0, 1, "PROFICIENT", { nextReviewAt: new Date(NOW.getTime() - 2 * DAY), proficientSince: new Date(NOW.getTime() - 20 * DAY) }), obj("B", 0, 2)]));
    expect(d.primary?.objective.code).toBe("A");
    expect(d.primary?.reasons.map((r) => r.kind)).toEqual(["REVIEW_DUE", "RETENTION_CHECK"]);
  });

  it("DEVELOPING beats the sequence frontier; PROFICIENT-not-due is only a review slot", () => {
    const d = run(base([obj("A", 0, 1, "PROFICIENT"), obj("B", 0, 2, "DEVELOPING"), obj("C", 0, 3)]));
    expect(d.primary?.objective.code).toBe("B");
    expect(d.rejected.find((r) => r.objective_code === "A")?.reason).toBe("LOWER_PRIORITY");
  });

  it("applies the repetition brake after the same objective twice running", () => {
    const objectives = [obj("A", 0, 1, "DEVELOPING"), obj("B", 0, 2, "PRACTISING")];
    const recent = [
      { id: "l2", primaryObjectiveId: idOf("A"), completedAt: NOW, status: "COMPLETED" },
      { id: "l1", primaryObjectiveId: idOf("A"), completedAt: NOW, status: "COMPLETED" },
    ];
    const d = run(base(objectives, [], { recentLessons: recent, successWithinWindow: new Set([idOf("A")]) }));
    expect(d.primary?.objective.code).toBe("B");
    expect(d.rejected.find((r) => r.objective_code === "A")?.reason).toBe("RECENTLY_TAUGHT");
  });

  it("penalises an objective with no success in its recent lessons, and a difficulty far above the working level", () => {
    const recent = [{ id: "l1", primaryObjectiveId: idOf("A"), completedAt: NOW, status: "COMPLETED" }];
    const d1 = run(base([obj("A", 0, 1, "PRACTISING")], [], { recentLessons: recent }));
    expect(d1.primary?.objective.code).toBe("A");
    expect(d1.primary?.breakdown.map((b) => b.component)).toEqual(expect.arrayContaining(["no_recent_success", "recently_taught"]));
    const d2 = run(base([obj("A", 0, 1, "MASTERED"), obj("B", 0, 2, "NOT_STARTED", { difficulty: 5 })]));
    expect(d2.primary?.objective.code).toBe("B");
    expect(d2.primary?.breakdown.some((b) => b.component === "difficulty_gap")).toBe(true);
  });

  it("produces honest empty outcomes: NEEDS_CURRICULUM, CURRICULUM_COMPLETE, BLOCKED, REVIEW_ONLY", () => {
    expect(run(base([], [], { hasCurriculum: false })).outcome).toBe("NEEDS_CURRICULUM");
    expect(run(base([obj("A", 0, 1, "MASTERED"), obj("B", 0, 2, "MASTERED")])).outcome).toBe("CURRICULUM_COMPLETE");
    const blocked = run(base([obj("A", 0, 1, "MASTERED"), obj("B", 0, 2)], [edge("A", "B", "HARD", "MASTERED"), edge("C", "B")].slice(1).concat([{ objectiveId: idOf("B"), prerequisiteObjectiveId: idOf("Z"), requiredStatus: "PROFICIENT", strength: "HARD" }])));
    expect(blocked.outcome).toBe("BLOCKED");
    const reviewOnly = run(base([obj("A", 0, 1, "MASTERED", { nextReviewAt: new Date(NOW.getTime() - DAY) })]));
    expect(reviewOnly.outcome).toBe("REVIEW_ONLY");
    expect(reviewOnly.reviews[0].objective.code).toBe("A");
  });

  it("explanation completeness: a PLANNED decision has reasons and a breakdown that sums to the score", () => {
    const d = run(base([obj("A", 0, 1, "DEVELOPING"), obj("B", 0, 2)]));
    expect(d.primary!.reasons.length).toBeGreaterThan(0);
    const sum = d.primary!.breakdown.reduce((a, b) => a + b.value, 0);
    expect(sum).toBeCloseTo(d.primary!.score, 6);
  });

  it("v2 opens units in order: a new objective in a later unit waits until the earlier unit is being practised", () => {
    // A beginner practised the days once; the next unit's past tense must not start yet.
    const objectives = [obj("A", 0, 1, "INTRODUCED"), obj("B", 0, 2), obj("C", 1, 1)];
    const edges = [edge("A", "B", "HARD", "DEVELOPING")];
    const recentLessons = [{ id: "l1", primaryObjectiveId: idOf("A"), completedAt: NOW, status: "COMPLETED" }];
    const v2 = selectNextObjective(base(objectives, edges, { recentLessons }), ENGINE_POLICY_V2);
    expect(v2.primary?.objective.code).toBe("A");
    expect(v2.rejected.find((r) => r.objective_code === "C")?.reason).toBe("UNIT_NOT_OPEN");
    // v1 would have jumped to the next unit.
    expect(selectNextObjective(base(objectives, edges, { recentLessons }), ENGINE_POLICY_V1).primary?.objective.code).toBe("C");
    // Once every objective of the unit is at least practised, the next unit opens.
    const later = [obj("A", 0, 1, "PRACTISING"), obj("B", 0, 2, "PRACTISING"), obj("C", 1, 1)];
    expect(selectNextObjective(base(later, [], { recentLessons: [{ id: "l2", primaryObjectiveId: idOf("A"), completedAt: NOW, status: "COMPLETED" }, { id: "l3", primaryObjectiveId: idOf("B"), completedAt: NOW, status: "COMPLETED" }] }), ENGINE_POLICY_V2).rejected.find((r) => r.objective_code === "C")).toBeUndefined();
  });

  it("units placed out at enrolment are not taught and count as met prerequisites", () => {
    const objectives = [obj("A", 0, 1, "NOT_STARTED", { placedOut: true }), obj("B", 0, 2, "NOT_STARTED", { placedOut: true }), obj("C", 1, 1), obj("D", 1, 2)];
    const edges = [edge("B", "C", "HARD", "PROFICIENT"), edge("C", "D", "HARD", "PROFICIENT")];
    const d = selectNextObjective(base(objectives, edges), ENGINE_POLICY_V2);
    expect(d.primary?.objective.code).toBe("C");
    expect(d.rejected.find((r) => r.objective_code === "A")?.reason).toBe("PLACED_OUT");
    expect(d.rejected.find((r) => r.objective_code === "D")?.reason).toBe("LOCKED");
  });
});
