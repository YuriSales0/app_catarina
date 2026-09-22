import { curriculumFileSchema, type CurriculumFile, type UnitFile, type SubUnitFile, type ObjectiveFile } from "@/schemas/curriculum-file";
import type { ObjectiveStatus, PrerequisiteStrength } from "@/lib/db/enums";

/**
 * Structural validation beyond the shape: unique keys, resolvable references,
 * prerequisites that only point backwards, and no cycles. Pure.
 */
export type FlatUnit = { key: string; parentKey: string | null; name: string; description: string; depth: number; order: number };
export type FlatObjective = {
  key: string;
  unitKey: string;
  unitOrder: number;
  sequence: number;
  objective: ObjectiveFile;
  prerequisites: Array<{ key: string; requiredStatus: ObjectiveStatus; strength: PrerequisiteStrength }>;
};

export type ValidatedCurriculum = {
  file: CurriculumFile;
  units: FlatUnit[];
  objectives: FlatObjective[];
  warnings: string[];
};

export type ValidationOutcome = { ok: true; value: ValidatedCurriculum } | { ok: false; errors: string[] };

type AnyUnit = UnitFile | SubUnitFile;
function childUnits(u: AnyUnit): SubUnitFile[] {
  return "units" in u ? u.units : [];
}

export function flattenUnits(units: AnyUnit[], parentKey: string | null, depth: number, acc: FlatUnit[]): void {
  for (const u of units) {
    acc.push({ key: u.key, parentKey, name: u.name, description: u.description, depth, order: acc.length });
    flattenUnits(childUnits(u), u.key, depth + 1, acc);
  }
}

function collectObjectives(units: AnyUnit[], flat: FlatUnit[], acc: FlatObjective[]): void {
  for (const u of units) {
    const unitOrder = flat.find((f) => f.key === u.key)!.order;
    u.objectives.forEach((o, i) => {
      acc.push({
        key: o.key,
        unitKey: u.key,
        unitOrder,
        sequence: i + 1,
        objective: o,
        prerequisites: o.prerequisites.map((p) =>
          typeof p === "string"
            ? { key: p, requiredStatus: "PROFICIENT" as const, strength: "HARD" as const }
            : { key: p.key, requiredStatus: p.required_status, strength: p.strength },
        ),
      });
    });
    collectObjectives(childUnits(u), flat, acc);
  }
}

/** Kahn's algorithm over HARD and SOFT edges; returns the keys on a cycle, if any. */
export function findCycle(objectives: FlatObjective[]): string[] | null {
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const o of objectives) {
    indeg.set(o.key, 0);
    out.set(o.key, []);
  }
  for (const o of objectives) {
    for (const p of o.prerequisites) {
      if (!out.has(p.key)) continue;
      out.get(p.key)!.push(o.key);
      indeg.set(o.key, (indeg.get(o.key) ?? 0) + 1);
    }
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([k]) => k);
  const seen = new Set<string>();
  while (queue.length) {
    const k = queue.shift()!;
    seen.add(k);
    for (const n of out.get(k) ?? []) {
      indeg.set(n, indeg.get(n)! - 1);
      if (indeg.get(n) === 0) queue.push(n);
    }
  }
  const remaining = objectives.map((o) => o.key).filter((k) => !seen.has(k));
  return remaining.length ? remaining : null;
}

export function validateCurriculumObject(input: unknown): ValidationOutcome {
  const parsed = curriculumFileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  const file = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  const units: FlatUnit[] = [];
  flattenUnits(file.units, null, 0, units);
  const unitKeys = new Set<string>();
  for (const u of units) {
    if (unitKeys.has(u.key)) errors.push(`duplicate unit key: ${u.key}`);
    unitKeys.add(u.key);
  }

  const objectives: FlatObjective[] = [];
  collectObjectives(file.units, units, objectives);
  const byKey = new Map<string, FlatObjective>();
  for (const o of objectives) {
    if (byKey.has(o.key)) errors.push(`duplicate objective key: ${o.key}`);
    byKey.set(o.key, o);
  }
  if (objectives.length === 0) errors.push("curriculum has no objectives");

  const skillKeys = new Set(file.skills.map((s) => s.key));
  const tagKeys = new Set(Object.keys(file.error_tags));

  for (const o of objectives) {
    for (const sk of o.objective.skills) {
      if (!skillKeys.has(sk)) errors.push(`objective ${o.key} references unknown skill ${sk}`);
    }
    for (const t of o.objective.error_tags) {
      if (!tagKeys.has(t)) errors.push(`objective ${o.key} references unknown error tag ${t}`);
    }
    for (const p of o.prerequisites) {
      if (p.key === o.key) {
        errors.push(`objective ${o.key} lists itself as a prerequisite`);
        continue;
      }
      const target = byKey.get(p.key);
      if (!target) {
        errors.push(`objective ${o.key} references unknown prerequisite ${p.key}`);
        continue;
      }
      if (target.unitOrder > o.unitOrder) {
        errors.push(`objective ${o.key} depends on ${p.key}, which is in a later unit; prerequisites may only point to the same or an earlier unit`);
      }
      if (target.unitOrder === o.unitOrder && target.sequence > o.sequence) {
        errors.push(`objective ${o.key} depends on ${p.key}, which comes later in the same unit`);
      }
      if (p.strength === "HARD" && target.objective.difficulty > o.objective.difficulty) {
        warnings.push(`objective ${o.key} (difficulty ${o.objective.difficulty}) has a harder hard-prerequisite ${p.key} (difficulty ${target.objective.difficulty})`);
      }
    }
  }

  if (errors.length === 0) {
    const cycle = findCycle(objectives);
    if (cycle) errors.push(`prerequisite cycle involving: ${cycle.join(", ")}`);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { file, units, objectives, warnings } };
}
