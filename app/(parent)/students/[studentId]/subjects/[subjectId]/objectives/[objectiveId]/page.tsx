import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent } from "@/lib/students/service";
import { explainObjectiveState } from "@/lib/learning/progress";
import { PageHeader, Section, StatusBadge, ConfidenceBadge, formatDateTime, Field } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { correctEvidenceAction } from "@/app/(parent)/lessons/actions";
import { roleAllows } from "@/lib/authorization/permissions";
import { CURRENT_STATE_POLICY } from "@/lib/learning/state-policy";

/** "Why is this objective marked X?" answered from the ledger, not from a narrative. */
export default async function ObjectiveExplanationPage(props: { params: Promise<{ studentId: string; subjectId: string; objectiveId: string }> }) {
  const { studentId, subjectId, objectiveId } = await props.params;
  const actor = await requireActor();
  const data = await or404(async () => {
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [student, x] = await Promise.all([getStudent(access), explainObjectiveState(access, objectiveId)]);
    return { access, student, x };
  });
  const { access, student, x } = data;
  const canRecord = roleAllows(access.role, "RECORD_EVIDENCE");
  const lessonNumber = (id: string | null) => x.lessons.find((l) => l.id === id)?.lessonNumber;
  const decided = new Set(x.state?.decidedByEvidenceIds ?? []);
  const p = CURRENT_STATE_POLICY;

  return (
    <>
      <PageHeader
        title={x.objective.title}
        crumbs={[
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subjectId}`, label: "Subject" },
        ]}
        subtitle={
          <>
            {x.objective.code} · <StatusBadge status={x.state?.status ?? "NOT_STARTED"} /> <ConfidenceBadge level={x.state?.confidence ?? "LOW"} />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div className="space-y-6">
          <Section title="Why this status">
            {x.state ? (
              <dl className="grid grid-cols-2 gap-1 text-sm">
                <dt className="text-muted">Assessed attempts</dt>
                <dd>{x.state.assessedAttempts}</dd>
                <dt className="text-muted">Recent success rate</dt>
                <dd>{x.state.successRateRecent ? `${Math.round(Number(x.state.successRateRecent) * 100)}%` : "—"} (last {p.recentWindow})</dd>
                <dt className="text-muted">Sessions</dt>
                <dd>{x.state.distinctLessonCount}</dd>
                <dt className="text-muted">Human or system graded</dt>
                <dd>{x.state.hasHumanOrSystemGradedEvidence ? "yes" : "no (AI-graded only, capped at proficient)"}</dd>
                <dt className="text-muted">Proficient since</dt>
                <dd>{formatDateTime(x.state.proficientSince, student.timezone)}</dd>
                <dt className="text-muted">Last assessed</dt>
                <dd>{formatDateTime(x.state.lastAssessedAt, student.timezone)}</dd>
                <dt className="text-muted">Rule</dt>
                <dd>{x.state.ruleVersion}</dd>
              </dl>
            ) : (
              <p className="text-sm text-muted">No evidence yet. The status is NOT_STARTED because nothing has been recorded.</p>
            )}
            <p className="mt-2 text-xs text-muted">
              Thresholds ({p.version}): developing needs {p.developingMinAttempts} attempts at {p.developingMinRate * 100}%; proficient needs {p.proficientMinAttempts} attempts at {p.proficientMinRate * 100}% across {p.proficientMinLessons} sessions; mastered needs a
              retention check {p.masteryRetentionDays} days later plus a human- or system-graded assessment.
            </p>
          </Section>
          <Section title={`State history · ${x.transitions.length}`}>
            <ol className="space-y-1 text-sm">
              {x.transitions.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">{formatDateTime(t.createdAt, student.timezone)}</span>
                  <StatusBadge status={t.fromStatus} /> → <StatusBadge status={t.toStatus} />
                  <span className="text-xs text-muted">
                    {t.decidedByEvidenceIds.length} attempts · {t.ruleVersion}
                  </span>
                </li>
              ))}
              {x.transitions.length === 0 ? <li className="text-muted">No transitions yet.</li> : null}
            </ol>
          </Section>
        </div>
        <Section title={`Evidence · ${x.evidence.length}`}>
          <p className="text-xs text-muted">Rows marked ● are the ones the current status was decided on. Corrections and retractions appear as their own rows and never overwrite the original.</p>
          <ul className="space-y-1 text-sm">
            {x.evidence.map((e) => (
              <li key={e.id} className={`rounded-md border px-3 py-2 ${decided.has(e.id) ? "border-primary/50" : "border-border"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    {decided.has(e.id) ? "● " : ""}
                    <strong>{e.result.toLowerCase().replace("_", " ")}</strong> · {e.evidenceType.toLowerCase().replace("_", " ")} · graded by {e.gradedBy.toLowerCase().replace("_", " ")}
                    {e.supersedesEvidenceId ? " · supersedes an earlier row" : ""}
                  </span>
                  <span className="text-xs text-muted">
                    {lessonNumber(e.lessonId) ? `Lesson ${lessonNumber(e.lessonId)} · ` : ""}
                    {formatDateTime(e.occurredAt, student.timezone)}
                  </span>
                </div>
                <p className="text-muted">
                  {e.prompt}
                  {e.studentResponse ? ` → "${e.studentResponse}"` : ""}
                  {e.errorTags.length ? ` · ${e.errorTags.join(", ")}` : ""}
                </p>
                {canRecord && e.evidenceType !== "CORRECTION" && e.evidenceType !== "RETRACTION" ? (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-muted">This row is wrong</summary>
                    <ActionForm action={correctEvidenceAction} submitLabel="Record correction" variant="secondary" className="mt-2 space-y-2">
                      <input type="hidden" name="studentId" value={student.id} />
                      <input type="hidden" name="evidenceId" value={e.id} />
                      <input type="hidden" name="returnTo" value={`/students/${student.id}/subjects/${subjectId}/objectives/${objectiveId}`} />
                      <Field label="What to do">
                        <select name="mode" className="input" defaultValue="CORRECTION">
                          <option value="CORRECTION">Correct the result</option>
                          <option value="RETRACTION">Retract it entirely</option>
                        </select>
                      </Field>
                      <Field label="Corrected result (for corrections)">
                        <select name="result" className="input" defaultValue={e.result}>
                          <option value="CORRECT">correct</option>
                          <option value="PARTIALLY_CORRECT">partially correct</option>
                          <option value="INCORRECT">incorrect</option>
                          <option value="NOT_ASSESSED">not assessed</option>
                        </select>
                      </Field>
                      <Field label="Reason">
                        <input name="reason" className="input" required maxLength={500} />
                      </Field>
                    </ActionForm>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
          <Link href={`/students/${student.id}/subjects/${subjectId}`} className="text-sm underline">
            Back to the subject
          </Link>
        </Section>
      </div>
    </>
  );
}
