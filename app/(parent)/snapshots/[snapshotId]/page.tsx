import Link from "next/link";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getSnapshot, listSnapshots } from "@/lib/snapshots/generate";
import { getStudent } from "@/lib/students/service";
import { PageHeader, Section, StatusBadge, formatDateTime, DemoBadge } from "@/components/ui";
import { NotFoundError } from "@/lib/authorization/errors";

async function resolveSnapshotStudent(snapshotId: string) {
  const { db } = await import("@/lib/db/client");
  const { learningSnapshots } = await import("@/lib/db/schema");
  const row = await db().query.learningSnapshots.findFirst({ where: eq(learningSnapshots.id, snapshotId), columns: { studentId: true } });
  if (!row) throw new NotFoundError();
  return row.studentId;
}

export default async function SnapshotPage(props: { params: Promise<{ snapshotId: string }> }) {
  const { snapshotId } = await props.params;
  const actor = await requireActor();
  const { student, payload, generatedFrom, row, previous } = await or404(async () => {
    z.string().uuid().parse(snapshotId);
    const studentId = await resolveSnapshotStudent(snapshotId);
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [student, snap, all] = await Promise.all([getStudent(access), getSnapshot(access, snapshotId), listSnapshots(access)]);
    const previous = all.find((x) => x.snapshotVersion < snap.row.snapshotVersion) ?? null;
    return { student, ...snap, previous };
  });
  return (
    <>
      <PageHeader
        title={`Snapshot #${payload.snapshot_version}`}
        crumbs={[
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/snapshots`, label: "Snapshots" },
        ]}
        subtitle={
          <>
            {formatDateTime(row.createdAt, student.timezone)} · {generatedFrom.trigger.toLowerCase().replace("_", " ")} · {payload.schema_version} · rules {generatedFrom.rule_version}, engine {generatedFrom.engine_version} · {generatedFrom.evidence_count} evidence rows · hash {row.contentHash.slice(0, 16)}{" "}
            <DemoBadge show={student.isDemo} />
          </>
        }
        actions={
          previous ? (
            <Link href={`/snapshots/${previous.id}`} className="btn btn-secondary">
              Previous (#{previous.snapshotVersion})
            </Link>
          ) : null
        }
      />
      <p className="mb-4 text-xs text-muted">
        Observed: {payload.epistemic_key.observed.length} sections · Inferred: {payload.epistemic_key.inferred.length} · Recommended: {payload.epistemic_key.recommended.length}. The key inside the document says which is which, so it stays honest when exported.
      </p>
      <div className="space-y-6">
        {payload.subjects.map((sub) => (
          <Section key={sub.subject.id} title={`${sub.subject.name} · ${sub.curriculum.name} v${sub.curriculum.version}`}>
            <p className="text-sm">
              <span className="text-xs uppercase text-muted">observed</span> · {sub.progress.objectives_total} objectives: {sub.progress.by_status.MASTERED} mastered, {sub.progress.by_status.PROFICIENT} proficient, {sub.progress.by_status.DEVELOPING} developing, {sub.progress.by_status.PRACTISING} practising, {sub.progress.by_status.INTRODUCED} introduced, {sub.progress.by_status.NOT_STARTED} not started · {sub.progress.units_completed}/{sub.progress.units_total} units complete
            </p>
            <p className="text-sm">
              Last 30 days: {sub.recent_evidence_summary.total_attempts} attempts on {sub.recent_evidence_summary.distinct_objectives} objectives ({sub.recent_evidence_summary.by_result.CORRECT} correct) · graded by human {sub.recent_evidence_summary.by_grader.HUMAN}, system {sub.recent_evidence_summary.by_grader.SYSTEM}, AI {sub.recent_evidence_summary.by_grader.AI_PROVIDER}
            </p>
            {sub.current_objectives.length ? (
              <div>
                <h3 className="text-sm font-medium">Current objectives</h3>
                <ul className="text-sm">
                  {sub.current_objectives.map((o) => (
                    <li key={o.objective_id}>
                      {o.title} <StatusBadge status={o.status} /> <span className="text-xs text-muted">{o.assessed_attempts} attempts{o.success_rate_recent !== null ? `, ${Math.round(o.success_rate_recent * 100)}% recent` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {sub.skill_states.length ? (
              <div>
                <h3 className="text-sm font-medium">Skills (30 days)</h3>
                <ul className="text-sm">
                  {sub.skill_states.map((k) => (
                    <li key={k.skill_id}>
                      {k.name}: {k.attempts_30d} attempts{k.success_rate_30d !== null ? `, ${Math.round(k.success_rate_30d * 100)}%` : ""} · <span className="text-xs text-muted">trend (inferred): {k.trend.toLowerCase().replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {sub.recurring_difficulties.length ? (
              <div>
                <h3 className="text-sm font-medium">
                  Recurring difficulties <span className="text-xs font-normal uppercase text-muted">inferred</span>
                </h3>
                <ul className="text-sm">
                  {sub.recurring_difficulties.map((d) => (
                    <li key={d.error_tag}>
                      {d.human_label}: {d.occurrences_30d} in 30 days, {d.trend.toLowerCase()}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {sub.review_priorities.length ? (
              <div>
                <h3 className="text-sm font-medium">Reviews due</h3>
                <ul className="text-sm">
                  {sub.review_priorities.map((r) => (
                    <li key={r.objective_id}>
                      {r.title}: {r.days_overdue} days overdue
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {sub.recommended_next_objectives.length ? (
              <p className="text-sm">
                <span className="text-xs uppercase text-muted">recommended</span> · next: {sub.recommended_next_objectives.map((r) => `${r.title} (${r.reason.toLowerCase().replace(/_/g, " ")})`).join("; ")}
              </p>
            ) : null}
            {sub.recent_lessons.length ? (
              <div>
                <h3 className="text-sm font-medium">Recent lessons</h3>
                <ul className="text-sm">
                  {sub.recent_lessons.map((l) => (
                    <li key={l.lesson_id}>
                      <Link href={`/lessons/${l.lesson_id}`} className="hover:underline">
                        Lesson {l.lesson_number}
                      </Link>
                      : {l.primary_objective.title}, {l.attempts} attempts{l.success_rate !== null ? `, ${Math.round(l.success_rate * 100)}%` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>
        ))}
        {payload.subjects.length === 0 ? <p className="text-sm text-muted">No enrolled subjects with a curriculum at the time of this snapshot.</p> : null}
      </div>
    </>
  );
}
