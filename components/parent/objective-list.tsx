import Link from "next/link";
import { StatusBadge } from "@/components/ui";
import type { StudentProgress } from "@/lib/learning/progress";

/** The trail, unit by unit. Locked objectives stay visible, faded, with what they need. */
export function ObjectiveList({ progress, studentId }: { progress: StudentProgress; studentId: string }) {
  const codeOf = (id: string) => progress.objectives.find((o) => o.objective.id === id)?.objective.code ?? "?";
  const groups = new Map<string, typeof progress.objectives>();
  for (const o of progress.objectives) {
    if (!groups.has(o.unit.id)) groups.set(o.unit.id, []);
    groups.get(o.unit.id)!.push(o);
  }
  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([unitId, rows]) => (
        <section key={unitId}>
          <h3 className="mb-2 font-display text-base font-semibold">{rows[0].unit.name}</h3>
          <ol className="space-y-1.5">
            {rows.map((o) => {
              const reviewDue = o.reviewDue;
              return (
                <li key={o.objective.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 px-4 py-2.5 text-sm ${o.unlock.unlocked ? "" : "opacity-60"}`}>
                  <Link href={`/students/${studentId}/subjects/${progress.subject.id}/objectives/${o.objective.id}`} className="min-w-0 font-bold hover:text-primary" title={o.objective.code}>
                    {o.objective.title}
                  </Link>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {o.state ? `${o.state.assessedAttempts} tentativas` : ""}
                    {!o.unlock.unlocked ? (
                      <span title={`Precisa de ${o.unlock.hardBlockers.map((b) => codeOf(b.prerequisiteObjectiveId)).join(", ")}`}>🔒 bloqueado</span>
                    ) : null}
                    {reviewDue ? <span className="font-bold text-peach-ink">revisão pendente</span> : null}
                    <StatusBadge status={o.status} short />
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
