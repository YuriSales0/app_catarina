import Link from "next/link";
import type { LessonReport } from "@/schemas/lesson-report";
import type { LearningObjectiveRow } from "@/lib/db/schema";
import { StatusBadge } from "@/components/ui";

/** Three sections, three epistemic statuses, never collapsed into one note. */
export function ReportView({ report, objectives, studentId, subjectId }: { report: LessonReport; objectives: LearningObjectiveRow[]; studentId: string; subjectId: string }) {
  const title = (id: string) => objectives.find((o) => o.id === id)?.title ?? id;
  const o = report.observed;
  const i = report.inferred;
  const r = report.recommended;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="card space-y-3 lg:col-span-1">
        <h2 className="font-semibold">Observed</h2>
        <p className="text-xs text-muted">What happened, computed from the evidence. No model writes this section.</p>
        <dl className="text-sm">
          <dt className="text-muted">Duration</dt>
          <dd>{o.actual_duration_minutes ?? "—"} min</dd>
          <dt className="mt-2 text-muted">Attempts</dt>
          <dd>
            {o.evidence_summary.total} total · {o.evidence_summary.by_result.CORRECT} correct · {o.evidence_summary.by_result.PARTIALLY_CORRECT} partial · {o.evidence_summary.by_result.INCORRECT} incorrect
          </dd>
          <dt className="mt-2 text-muted">Graded by</dt>
          <dd>
            human {o.evidence_summary.by_grader.HUMAN} · system {o.evidence_summary.by_grader.SYSTEM} · AI {o.evidence_summary.by_grader.AI_PROVIDER}
          </dd>
        </dl>
        <h3 className="text-sm font-medium">Objectives attempted</h3>
        <ul className="space-y-1 text-sm">
          {o.objectives_attempted.map((a) => (
            <li key={a.objective_id}>
              <Link href={`/students/${studentId}/subjects/${subjectId}/objectives/${a.objective_id}`} className="hover:underline">
                {a.title}
              </Link>
              : {a.correct}/{a.attempts} correct{a.partially_correct ? `, ${a.partially_correct} partial` : ""}
            </li>
          ))}
        </ul>
        {o.state_transitions.length ? (
          <>
            <h3 className="text-sm font-medium">State changes</h3>
            <ul className="space-y-1 text-sm">
              {o.state_transitions.map((t) => (
                <li key={t.transition_id}>
                  {title(t.objective_id)}: <StatusBadge status={t.from_status} /> → <StatusBadge status={t.to_status} /> <span className="text-xs text-muted">({t.rule_version})</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {o.errors_observed.length ? (
          <>
            <h3 className="text-sm font-medium">Errors observed</h3>
            <ul className="text-sm">
              {o.errors_observed.map((e) => (
                <li key={e.error_tag}>
                  {e.human_label} × {e.count}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {o.teacher_notes.length ? (
          <>
            <h3 className="text-sm font-medium">Teacher notes</h3>
            <ul className="text-sm">
              {o.teacher_notes.map((n) => (
                <li key={n.event_id}>{n.text}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">What this might mean</h2>
        <p className="text-xs text-muted">Inferences. Each names its source and the evidence it reads. They never change the learning state.</p>
        {i.statements.length === 0 && i.recurring_errors.length === 0 && i.successful_patterns.length === 0 && i.failed_patterns.length === 0 ? <p className="text-sm text-muted">Nothing to infer from this lesson yet.</p> : null}
        <ul className="space-y-2 text-sm">
          {i.statements.map((st, idx) => (
            <li key={idx}>
              {st.statement} <span className="text-xs text-muted">({st.source.toLowerCase().replace("_", " ")}, {st.confidence.toLowerCase()} confidence, {st.basis_evidence_ids.length} attempts)</span>
            </li>
          ))}
        </ul>
        {i.recurring_errors.length ? (
          <ul className="text-sm">
            {i.recurring_errors.map((e) => (
              <li key={e.error_tag}>
                {e.human_label}: {e.occurrences_this_lesson} this lesson, {e.occurrences_last_30_days} in 30 days{e.is_recurring ? " · recurring" : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {i.successful_patterns.length ? (
          <ul className="text-sm text-success">
            {i.successful_patterns.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        {i.failed_patterns.length ? (
          <ul className="text-sm text-warning">
            {i.failed_patterns.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Suggested next steps</h2>
        <p className="text-xs text-muted">Proposals. Nothing here is applied automatically; the engine decides the next lesson afresh.</p>
        {r.recommended_review.length ? (
          <ul className="space-y-1 text-sm">
            {r.recommended_review.map((x) => (
              <li key={x.objective_id}>
                Review {title(x.objective_id)}: {x.reason}
              </li>
            ))}
          </ul>
        ) : null}
        {r.pacing ? (
          <p className="text-sm">
            <strong>{r.pacing.suggestion.toLowerCase().replace("_", " ")}:</strong> {r.pacing.reason}
          </p>
        ) : null}
        {r.parent_actions.length ? (
          <ul className="space-y-1 text-sm">
            {r.parent_actions.map((a) => (
              <li key={a.action}>
                {a.action} <span className="text-xs text-muted">({a.reason})</span>
              </li>
            ))}
          </ul>
        ) : null}
        {!r.recommended_review.length && !r.pacing && !r.parent_actions.length ? <p className="text-sm text-muted">No recommendations from this lesson.</p> : null}
      </section>
    </div>
  );
}
