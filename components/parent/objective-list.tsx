import Link from "next/link";
import { StatusBadge } from "@/components/ui";
import type { StudentProgress } from "@/lib/learning/progress";

export function ObjectiveList({ progress, studentId }: { progress: StudentProgress; studentId: string }) {
  const codeOf = (id: string) => progress.objectives.find((o) => o.objective.id === id)?.objective.code ?? "?";
  const groups = new Map<string, typeof progress.objectives>();
  for (const o of progress.objectives) {
    if (!groups.has(o.unit.id)) groups.set(o.unit.id, []);
    groups.get(o.unit.id)!.push(o);
  }
  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([unitId, rows]) => (
        <section key={unitId}>
          <h3 className="mb-2 font-semibold">{rows[0].unit.name}</h3>
          <ol className="space-y-1">
            {rows.map((o) => (
              <li key={o.objective.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm ${o.unlock.unlocked ? "" : "opacity-60"}`}>
                <Link href={`/students/${studentId}/subjects/${progress.subject.id}/objectives/${o.objective.id}`} className="hover:underline">
                  <span className="text-xs text-muted">{o.objective.code}</span> {o.objective.title}
                </Link>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {o.state ? `${o.state.assessedAttempts} attempts` : ""}
                  {!o.unlock.unlocked ? <span title={`Requires ${o.unlock.hardBlockers.map((b) => `${codeOf(b.prerequisiteObjectiveId)} at ${b.requiredStatus.toLowerCase()}`).join(", ")}`}>locked</span> : null}
                  {o.review?.nextReviewAt && o.review.nextReviewAt.getTime() <= Date.now() && (o.status === "PROFICIENT" || o.status === "MASTERED") ? <span className="text-warning">review due</span> : null}
                  <StatusBadge status={o.status} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
