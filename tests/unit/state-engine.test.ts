import { describe, it, expect } from "vitest";
import { evaluateObjectiveState } from "@/lib/learning/state-engine";
import { STATE_POLICY_V1 } from "@/lib/learning/state-policy";
import { effectiveEvidence, type EvidenceRow } from "@/lib/learning/evidence-view";
import type { EvidenceResult, GradedBy, EvidenceType } from "@/lib/db/enums";

const T0 = new Date("2026-01-01T10:00:00Z");
const DAY = 86_400_000;
let seq = 0;

function ev(
  result: EvidenceResult,
  opts: { day?: number; lesson?: string | null; gradedBy?: GradedBy; type?: EvidenceType; id?: string; supersedes?: string } = {},
): EvidenceRow {
  seq++;
  const day = opts.day ?? 0;
  return {
    id: opts.id ?? `e${seq.toString().padStart(4, "0")}`,
    lessonId: opts.lesson === undefined ? `L${day}` : opts.lesson,
    result,
    evidenceType: opts.type ?? "PRACTICE",
    gradedBy: opts.gradedBy ?? "HUMAN",
    confidence: "MEDIUM",
    supersedesEvidenceId: opts.supersedes ?? null,
    errorTags: [],
    occurredAt: new Date(T0.getTime() + day * DAY + seq * 1000),
  };
}

const NOW = new Date(T0.getTime() + 60 * DAY);
const evaluate = (rows: EvidenceRow[], now = NOW) => evaluateObjectiveState(rows, STATE_POLICY_V1, "Europe/Lisbon", now);

describe("evaluateObjectiveState", () => {
  it("NOT_STARTED with no evidence, INTRODUCED with unassessed exposure", () => {
    expect(evaluate([]).status).toBe("NOT_STARTED");
    expect(evaluate([ev("NOT_ASSESSED")]).status).toBe("INTRODUCED");
    expect(evaluate([ev("CORRECT"), ev("CORRECT")]).status).toBe("INTRODUCED");
  });

  it("PRACTISING with three or more attempts at a low rate", () => {
    const d = evaluate([ev("INCORRECT"), ev("INCORRECT"), ev("CORRECT")]);
    expect(d.status).toBe("PRACTISING");
    expect(d.confidence).toBe("LOW");
  });

  it("DEVELOPING at five attempts with rate >= 0.6", () => {
    const d = evaluate([ev("CORRECT"), ev("CORRECT"), ev("CORRECT"), ev("INCORRECT"), ev("PARTIALLY_CORRECT")]);
    expect(d.status).toBe("DEVELOPING");
    expect(d.successRateRecent).toBeCloseTo(0.7);
    expect(d.confidence).toBe("MEDIUM");
  });

  it("PROFICIENT needs eight attempts, rate >= 0.8 and two sessions; one session is not enough", () => {
    const oneSession = Array.from({ length: 8 }, () => ev("CORRECT", { day: 0 }));
    expect(evaluate(oneSession).status).toBe("DEVELOPING");
    const twoSessions = [...Array.from({ length: 4 }, () => ev("CORRECT", { day: 0 })), ...Array.from({ length: 4 }, () => ev("CORRECT", { day: 1 }))];
    const d = evaluate(twoSessions);
    expect(d.status).toBe("PROFICIENT");
    expect(d.confidence).toBe("HIGH");
    expect(d.proficientSince).toEqual(twoSessions[7].occurredAt);
  });

  it("a PROFICIENT objective is held above 0.6 and falls back to DEVELOPING below it, never lower", () => {
    const rows = [...Array.from({ length: 4 }, () => ev("CORRECT", { day: 0 })), ...Array.from({ length: 4 }, () => ev("CORRECT", { day: 1 }))];
    expect(evaluate(rows).status).toBe("PROFICIENT");
    const wobble = [...rows, ...Array.from({ length: 3 }, () => ev("INCORRECT", { day: 2 }))];
    expect(evaluate(wobble).status).toBe("PROFICIENT");
    const worse = [...rows, ...Array.from({ length: 5 }, () => ev("INCORRECT", { day: 2 }))];
    const d = evaluate(worse);
    expect(d.status).toBe("DEVELOPING");
    expect(d.proficientSince).toBeNull();
    const collapse = [...rows, ...Array.from({ length: 10 }, () => ev("INCORRECT", { day: 3 }))];
    expect(evaluate(collapse).status).toBe("DEVELOPING");
  });

  it("MASTERED requires a passed retention check 14 days later AND a human/system-graded ASSESSMENT", () => {
    const base = [...Array.from({ length: 4 }, () => ev("CORRECT", { day: 0 })), ...Array.from({ length: 4 }, () => ev("CORRECT", { day: 1 }))];
    const tooEarly = [...base, ev("CORRECT", { day: 5 }), ev("CORRECT", { day: 5 })];
    expect(evaluate(tooEarly).status).toBe("PROFICIENT");

    const lateNoAssessment = [...base, ev("CORRECT", { day: 20 }), ev("CORRECT", { day: 20 })];
    const d1 = evaluate(lateNoAssessment);
    expect(d1.status).toBe("PROFICIENT");
    expect(d1.rationale.notes.join(" ")).toMatch(/ASSESSMENT/);

    const withAssessment = [...base, ev("CORRECT", { day: 20, type: "ASSESSMENT" }), ev("CORRECT", { day: 20 })];
    const d2 = evaluate(withAssessment);
    expect(d2.status).toBe("MASTERED");
    expect(d2.rationale.retention_check?.passed).toBe(true);
    expect(d2.decidedByEvidenceIds.length).toBeGreaterThan(0);
  });

  it("the clock matters: retention evidence in the future is not counted", () => {
    const base = [...Array.from({ length: 4 }, () => ev("CORRECT", { day: 0 })), ...Array.from({ length: 4 }, () => ev("CORRECT", { day: 1 }))];
    const rows = [...base, ev("CORRECT", { day: 20, type: "ASSESSMENT" }), ev("CORRECT", { day: 20 })];
    expect(evaluate(rows, new Date(T0.getTime() + 10 * DAY)).status).toBe("PROFICIENT");
    expect(evaluate(rows, new Date(T0.getTime() + 30 * DAY)).status).toBe("MASTERED");
  });

  it("AI-graded-only evidence never reaches MASTERED or HIGH confidence (proof 3)", () => {
    const ai = (day: number, type: EvidenceType = "PRACTICE") => ev("CORRECT", { day, gradedBy: "AI_PROVIDER", type });
    const rows = [
      ...Array.from({ length: 4 }, () => ai(0)),
      ...Array.from({ length: 4 }, () => ai(1)),
      ai(20, "ASSESSMENT"),
      ai(20, "ASSESSMENT"),
      ai(21),
    ];
    const d = evaluate(rows);
    expect(d.status).toBe("PROFICIENT");
    expect(d.confidence).toBe("MEDIUM");
    expect(d.rationale.ai_graded_only).toBe(true);
    expect(d.hasHumanOrSystemGradedEvidence).toBe(false);
  });

  it("is deterministic and order-independent", () => {
    const rows = [ev("CORRECT", { day: 0 }), ev("INCORRECT", { day: 1 }), ev("CORRECT", { day: 2 }), ev("PARTIALLY_CORRECT", { day: 3 }), ev("CORRECT", { day: 4 })];
    const a = evaluate(rows);
    const b = evaluate([...rows].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("effectiveEvidence", () => {
  it("a CORRECTION replaces the original in place and a RETRACTION removes it", () => {
    const original = ev("CORRECT", { day: 0, id: "orig" });
    const wrong = ev("CORRECT", { day: 1, id: "wrong" });
    const correction = ev("INCORRECT", { day: 5, id: "corr", type: "CORRECTION", supersedes: "orig" });
    const retraction = ev("NOT_ASSESSED", { day: 6, id: "retr", type: "RETRACTION", supersedes: "wrong" });
    const eff = effectiveEvidence([retraction, correction, wrong, original]);
    expect(eff.map((r) => r.id)).toEqual(["corr"]);
    expect(eff[0].result).toBe("INCORRECT");
    expect(eff[0].occurredAt).toEqual(original.occurredAt);
    expect(eff[0].evidenceType).toBe("PRACTICE");
  });
});
