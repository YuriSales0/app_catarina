import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent, getEnrolment } from "@/lib/students/service";
import { getStudentProgress } from "@/lib/learning/progress";
import { PageHeader, Section, StatusBadge, ConfidenceBadge, formatDateTime, DemoBadge } from "@/components/ui";
import { OBJECTIVE_STATUSES } from "@/lib/db/enums";

/** Screen 7: the knowledge model in full, by unit, with skills and the transition history. */
export default async function ProgressPage(props: { params: Promise<{ studentId: string; subjectId: string }> }) {
  const { studentId, subjectId } = await props.params;
  const actor = await requireActor();
  const { student, enrolment, progress } = await or404(async () => {
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [student, enrolment, progress] = await Promise.all([getStudent(access), getEnrolment(access, subjectId), getStudentProgress(access, subjectId)]);
    return { student, enrolment, progress };
  });
  const units = new Map<string, typeof progress.objectives>();
  for (const o of progress.objectives) units.set(o.unit.id, [...(units.get(o.unit.id) ?? []), o]);
  const skills = new Map<string, { total: number; byStatus: Record<string, number> }>();
  for (const o of progress.objectives) for (const k of o.skills) {
    const cur = skills.get(k) ?? { total: 0, byStatus: {} };
    cur.total++;
    cur.byStatus[o.status] = (cur.byStatus[o.status] ?? 0) + 1;
    skills.set(k, cur);
  }
  const titleOf = (id: string) => progress.objectives.find((o) => o.objective.id === id)?.objective.title ?? id;

  return (
    <>
      <PageHeader
        title={`${student.name} · ${enrolment.subjectName} · Progress`}
        crumbs={[
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subjectId}`, label: enrolment.subjectName },
        ]}
        subtitle={
          <>
            {progress.curriculum.name} v{progress.version.version} · {progress.summary.total} objectives · {progress.summary.MASTERED} mastered, {progress.summary.PROFICIENT} proficient <DemoBadge show={student.isDemo} />
          </>
        }
      />
      <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {OBJECTIVE_STATUSES.map((st) => (
          <div key={st} className="card p-3 text-center">
            <p className="text-2xl font-semibold">{progress.summary[st]}</p>
            <p className="text-xs text-muted">{st.toLowerCase().replace("_", " ")}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          {[...units.entries()].map(([unitId, rows]) => (
            <Section key={unitId} title={rows[0].unit.name}>
              <ul className="space-y-1 text-sm">
                {rows.map((o) => (
                  <li key={o.objective.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                    <Link href={`/students/${student.id}/subjects/${subjectId}/objectives/${o.objective.id}`} className="hover:underline">
                      {o.objective.title}
                    </Link>
                    <span className="flex flex-wrap items-center gap-1 text-xs text-muted">
                      {o.skills.join(", ")}
                      {o.state ? ` · ${o.state.assessedAttempts} attempts` : ""}
                      {o.state?.successRateRecent ? ` · ${Math.round(Number(o.state.successRateRecent) * 100)}%` : ""}
                      <StatusBadge status={o.status} />
                      {o.state ? <ConfidenceBadge level={o.confidence} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
        <div className="space-y-6">
          <Section title="By skill">
            <ul className="space-y-1 text-sm">
              {[...skills.entries()].map(([name, v]) => (
                <li key={name}>
                  <strong>{name}</strong>: {v.total} objectives · {v.byStatus.MASTERED ?? 0} mastered, {v.byStatus.PROFICIENT ?? 0} proficient, {(v.byStatus.DEVELOPING ?? 0) + (v.byStatus.PRACTISING ?? 0) + (v.byStatus.INTRODUCED ?? 0)} in progress
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Recent state changes">
            <ul className="space-y-1 text-xs">
              {progress.recentTransitions.slice(0, 12).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-1">
                  <span className="text-muted">{formatDateTime(t.createdAt, student.timezone)}</span> {titleOf(t.objectiveId)}: <StatusBadge status={t.fromStatus} /> → <StatusBadge status={t.toStatus} />
                </li>
              ))}
              {progress.recentTransitions.length === 0 ? <li className="text-muted">No changes yet.</li> : null}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
