import { describe, it, expect } from "vitest";
import { evaluateUnlock, type PrerequisiteEdge } from "@/lib/learning/prerequisites";

const lineageOf = new Map([
  ["A", "la"],
  ["B", "lb"],
  ["C", "lc"],
]);
const edges: PrerequisiteEdge[] = [
  { objectiveId: "C", prerequisiteObjectiveId: "A", requiredStatus: "PROFICIENT", strength: "HARD" },
  { objectiveId: "C", prerequisiteObjectiveId: "B", requiredStatus: "DEVELOPING", strength: "SOFT" },
];

describe("evaluateUnlock", () => {
  it("locks when a HARD prerequisite is below its required status", () => {
    const r = evaluateUnlock("C", edges, lineageOf, new Map([["la", "DEVELOPING"]]));
    expect(r.unlocked).toBe(false);
    expect(r.hardBlockers).toHaveLength(1);
  });
  it("unlocks on HARD satisfied even with SOFT unmet", () => {
    const r = evaluateUnlock("C", edges, lineageOf, new Map([["la", "MASTERED"]]));
    expect(r.unlocked).toBe(true);
    expect(r.softUnmet).toHaveLength(1);
    expect(r.satisfied).toHaveLength(1);
  });
  it("uses lineage, so an earlier version's state counts", () => {
    const r = evaluateUnlock("C", edges, new Map([...lineageOf, ["A", "la-shared"]]), new Map([["la-shared", "PROFICIENT"]]));
    expect(r.unlocked).toBe(true);
  });
  it("an objective with no prerequisites is unlocked", () => {
    expect(evaluateUnlock("A", edges, lineageOf, new Map()).unlocked).toBe(true);
  });
});
