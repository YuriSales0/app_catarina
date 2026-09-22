import { statusAtLeast, type ObjectiveStatus, type PrerequisiteStrength } from "@/lib/db/enums";

export type PrerequisiteEdge = {
  objectiveId: string;
  prerequisiteObjectiveId: string;
  requiredStatus: ObjectiveStatus;
  strength: PrerequisiteStrength;
};

export type ObjectiveRef = { id: string; lineageId: string };

/** Status lookup by objective lineage, so evidence from an earlier version counts (D8). */
export type StatusByLineage = ReadonlyMap<string, ObjectiveStatus>;

export type UnlockResult = {
  unlocked: boolean;
  hardBlockers: Array<{ prerequisiteObjectiveId: string; requiredStatus: ObjectiveStatus; actual: ObjectiveStatus }>;
  softUnmet: Array<{ prerequisiteObjectiveId: string; requiredStatus: ObjectiveStatus; actual: ObjectiveStatus }>;
  satisfied: Array<{ prerequisiteObjectiveId: string; requiredStatus: ObjectiveStatus; actual: ObjectiveStatus }>;
};

/** Pure. An objective is unlocked when every HARD prerequisite meets its required status. */
export function evaluateUnlock(
  objectiveId: string,
  edges: PrerequisiteEdge[],
  lineageOf: ReadonlyMap<string, string>,
  statusByLineage: StatusByLineage,
): UnlockResult {
  const result: UnlockResult = { unlocked: true, hardBlockers: [], softUnmet: [], satisfied: [] };
  for (const e of edges) {
    if (e.objectiveId !== objectiveId) continue;
    const lineage = lineageOf.get(e.prerequisiteObjectiveId);
    const actual: ObjectiveStatus = (lineage ? statusByLineage.get(lineage) : undefined) ?? "NOT_STARTED";
    const entry = { prerequisiteObjectiveId: e.prerequisiteObjectiveId, requiredStatus: e.requiredStatus, actual };
    if (statusAtLeast(actual, e.requiredStatus)) result.satisfied.push(entry);
    else if (e.strength === "HARD") {
      result.hardBlockers.push(entry);
      result.unlocked = false;
    } else result.softUnmet.push(entry);
  }
  return result;
}
