import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent, getEnrolment } from "@/lib/students/service";
import { getNextLessonPlan } from "@/lib/learning/next-lesson";
import { PageHeader, Section, StatusBadge, DemoBadge } from "@/components/ui";
import { PlanRationale } from "@/components/parent/plan-rationale";
import { createFromPlanAction } from "./actions";
import { roleAllows } from "@/lib/authorization/permissions";

export default async function NextLessonPage(props: { params: Promise<{ studentId: string; subjectId: string }> }) {
  const { studentId, subjectId } = await props.params;
  const actor = await requireActor();
  const { access, student, enrolment, plan } = await or404(async () => {
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [student, enrolment, plan] = await Promise.all([getStudent(access), getEnrolment(access, subjectId), getNextLessonPlan(access, subjectId)]);
    return { access, student, enrolment, plan };
  });
  const canRun = roleAllows(access.role, "RUN_LESSON");

  return (
    <>
      <PageHeader
        title="Next lesson"
        crumbs={[
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subjectId}`, label: enrolment.subjectName },
        ]}
        subtitle={
          <>
            Chosen by the engine ({plan.engine_version}, {plan.rationale.policy_version}) from the curriculum, the prerequisite graph, the evidence and the review schedule. No AI is involved in this decision. <DemoBadge show={student.isDemo} />
          </>
        }
      />
      {plan.outcome === "PLANNED" && plan.primary_objective ? (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-6">
            <Section title="Plan">
              <p className="text-lg">
                <strong>{plan.primary_objective.title}</strong> <StatusBadge status={plan.primary_objective.status} />
              </p>
              {plan.review_objectives.length ? (
                <p className="text-sm text-muted">
                  Also review: {plan.review_objectives.map((r) => `${r.title}${r.days_overdue !== null ? ` (${r.days_overdue} days overdue)` : ""}`).join(", ")}
                </p>
              ) : null}
              <ol className="mt-2 space-y-2">
                {plan.activities.map((a) => (
                  <li key={a.sequence} className="rounded-md border border-border p-3 text-sm">
                    <span className="font-medium">
                      {a.sequence}. {a.activity_type.toLowerCase()} · {a.planned_minutes} min
                    </span>
                    <p className="text-muted">{a.instructions}</p>
                  </li>
                ))}
              </ol>
              {canRun ? (
                <form action={createFromPlanAction} className="mt-3">
                  <input type="hidden" name="studentId" value={student.id} />
                  <input type="hidden" name="subjectId" value={subjectId} />
                  <button type="submit" className="btn btn-primary">
                    Create this lesson
                  </button>
                </form>
              ) : null}
            </Section>
          </div>
          <div className="space-y-6">
            <PlanRationale plan={plan} studentId={student.id} subjectId={subjectId} />
          </div>
        </div>
      ) : (
        <Section title={outcomeTitle(plan.outcome)}>
          <p className="text-sm text-muted">{outcomeText(plan.outcome)}</p>
          {plan.outcome === "BLOCKED" && plan.blocking_objectives.length ? (
            <ul className="text-sm">
              {plan.blocking_objectives.map((b) => (
                <li key={b.id}>
                  <Link href={`/students/${student.id}/subjects/${subjectId}/objectives/${b.id}`} className="underline">
                    {b.title}
                  </Link>{" "}
                  is <StatusBadge status={b.status} /> and must progress first.
                </li>
              ))}
            </ul>
          ) : null}
          {plan.outcome === "REVIEW_ONLY" ? (
            <ul className="text-sm">
              {plan.review_objectives.map((r) => (
                <li key={r.id}>
                  {r.title}: {r.days_overdue} days overdue
                </li>
              ))}
            </ul>
          ) : null}
          {plan.outcome === "NEEDS_CURRICULUM" ? (
            <Link href={`/students/${student.id}`} className="underline">
              Choose a curriculum on the student profile.
            </Link>
          ) : null}
        </Section>
      )}
    </>
  );
}

function outcomeTitle(o: string) {
  return { CURRICULUM_COMPLETE: "Everything is mastered", BLOCKED: "Nothing is available yet", NEEDS_CURRICULUM: "No curriculum chosen", REVIEW_ONLY: "Only reviews are due" }[o] ?? o;
}
function outcomeText(o: string) {
  return (
    {
      CURRICULUM_COMPLETE: "Every objective in this curriculum is mastered. Time for the next curriculum, or a newer version.",
      BLOCKED: "Every remaining objective is behind a prerequisite that is not yet at the required level. The engine does not invent an alternative; it names the blockers.",
      NEEDS_CURRICULUM: "The engine will not guess a curriculum.",
      REVIEW_ONLY: "No new objective is available, but some mastered ones are due for a retention check.",
    }[o] ?? ""
  );
}
