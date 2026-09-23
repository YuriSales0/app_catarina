import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getLesson } from "@/lib/lessons/service";
import { getStudent } from "@/lib/students/service";
import { resolveLessonStudent } from "@/lib/lessons/resolve";
import { PageHeader, Section, Field, formatDateTime, StatusBadge } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { EvidenceForm } from "@/components/parent/evidence-form";
import { startLessonAction, cancelLessonAction, completeLessonAction, teacherNoteAction, requestAiContentAction } from "../actions";
import { getAIProvider } from "@/lib/ai";
import { hasAiConsent } from "@/lib/lessons/ai-proposals";
import type { ActivityProposal } from "@/schemas/ai-proposals";
import { roleAllows } from "@/lib/authorization/permissions";
import { z } from "zod";
import type { NextLessonPlan } from "@/schemas/lesson-plan";

export default async function LessonPage(props: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await props.params;
  const actor = await requireActor();
  const data = await or404(async () => {
    z.string().uuid().parse(lessonId);
    const studentId = await resolveLessonStudent(lessonId);
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [detail, student] = await Promise.all([getLesson(access, lessonId), getStudent(access)]);
    return { access, detail, student };
  });
  const { access, detail, student } = data;
  const { lesson, activities, events, evidence, report, subject, version, primaryObjective, objectives } = detail;
  const [provider, aiConsent] = await Promise.all([getAIProvider(), hasAiConsent(student.id)]);
  const aiAvailable = provider.id !== "null" && aiConsent;
  const proposalsFor = (activityId: string) =>
    events
      .filter((e) => e.activityId === activityId && e.eventType === "AI_PROPOSAL_RECEIVED" && (e.payload as { kind?: string }).kind === "activity")
      .map((e) => (e.payload as { proposal: ActivityProposal }).proposal);
  const canRun = roleAllows(access.role, "RUN_LESSON");
  const plan = lesson.planPayload as unknown as NextLessonPlan;
  const objectiveById = new Map(objectives.map((o) => [o.id, o]));
  const evidenceByActivity = (id: string) => evidence.filter((e) => e.activityId === id);

  return (
    <>
      <PageHeader
        title={`Lesson ${lesson.lessonNumber} · ${primaryObjective.title}`}
        crumbs={[
          { href: "/students", label: "Students" },
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subject.id}`, label: subject.name },
        ]}
        subtitle={
          <>
            {lesson.status.toLowerCase().replace("_", " ")} · planned {lesson.plannedDurationMinutes} min · {plan.source === "MANUAL" ? "chosen by hand" : `chosen by the engine (${lesson.planEngineVersion})`}
            {lesson.startedAt ? ` · started ${formatDateTime(lesson.startedAt, student.timezone)}` : ""}
          </>
        }
        actions={
          <>
            {lesson.status === "PLANNED" && canRun ? (
              <form action={startLessonAction}>
                <input type="hidden" name="studentId" value={student.id} />
                <input type="hidden" name="lessonId" value={lesson.id} />
                <button type="submit" className="btn btn-primary">
                  Start lesson
                </button>
              </form>
            ) : null}
            {lesson.status !== "COMPLETED" && lesson.status !== "CANCELLED" && canRun ? (
              <form action={cancelLessonAction}>
                <input type="hidden" name="studentId" value={student.id} />
                <input type="hidden" name="lessonId" value={lesson.id} />
                <button type="submit" className="btn btn-danger">
                  Cancel
                </button>
              </form>
            ) : null}
            {report ? (
              <Link href={`/lessons/${lesson.id}/report`} className="btn btn-secondary">
                Lesson report
              </Link>
            ) : null}
            <Link href={`/lessons/${lesson.id}/context`} className="btn btn-secondary">
              Context pack
            </Link>
            {lesson.status !== "COMPLETED" && lesson.status !== "CANCELLED" && canRun ? (
              <Link href={`/play/${lesson.id}`} className="btn btn-secondary">
                Child mode
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          {plan.primary_objective ? (
            <p className="text-sm">
              Main objective: <strong>{plan.primary_objective.title}</strong> <StatusBadge status={plan.primary_objective.status} />
              {plan.review_objectives.length ? <> · Review: {plan.review_objectives.map((r) => r.title).join(", ")}</> : null}
            </p>
          ) : null}
          <ol className="space-y-4">
            {activities.map((a) => {
              const obj = a.objectiveId ? objectiveById.get(a.objectiveId) : null;
              const rows = evidenceByActivity(a.id);
              return (
                <li key={a.id} className="card">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-semibold">
                      {a.sequence}. {a.activityType.toLowerCase()} · {a.plannedMinutes} min
                    </h2>
                    <span className="text-xs text-muted">
                      {rows.length}
                      {a.expectedEvidenceCount ? ` of ~${a.expectedEvidenceCount}` : ""} attempts recorded
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{a.instructions}</p>
                  {obj ? (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-muted">Teaching notes for {obj.code}</summary>
                      <TeachingNotes notes={obj.teachingNotes} />
                    </details>
                  ) : null}
                  {rows.length ? (
                    <ul className="mt-2 space-y-1 text-xs">
                      {rows.map((e) => (
                        <li key={e.id} className="flex justify-between gap-2 rounded border border-border px-2 py-1">
                          <span>
                            <strong>{e.result.toLowerCase().replace("_", " ")}</strong> · {e.prompt}
                            {e.studentResponse ? ` → "${e.studentResponse}"` : ""}
                            {e.errorTags.length ? ` · ${e.errorTags.join(", ")}` : ""}
                          </span>
                          <span className="text-muted">#{e.attemptNumber}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {proposalsFor(a.id).map((p, i) => (
                    <div key={i} className="mt-2 rounded-md border border-primary/40 bg-accent p-3 text-sm">
                      <p className="text-xs uppercase text-muted">AI suggestion (how to teach, not what was learned)</p>
                      <p className="font-medium">{p.title}</p>
                      <p>{p.child_facing_intro}</p>
                      <ol className="mt-1 list-decimal pl-5">
                        {p.items.map((it, j) => (
                          <li key={j}>
                            {it.prompt}
                            {it.expected_response ? <span className="text-muted"> → {it.expected_response}</span> : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                  {lesson.status === "IN_PROGRESS" && canRun && obj && aiAvailable && a.activityType !== "REVIEW" ? (
                    <ActionForm action={requestAiContentAction} submitLabel="Ask the AI for content" variant="secondary" className="mt-2 space-y-2">
                      <input type="hidden" name="studentId" value={student.id} />
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <input type="hidden" name="activityId" value={a.id} />
                    </ActionForm>
                  ) : null}
                  {lesson.status === "IN_PROGRESS" && canRun && obj && a.activityType !== "EXPLANATION" ? (
                    <details className="mt-3" open={rows.length < (a.expectedEvidenceCount ?? 1)}>
                      <summary className="cursor-pointer text-sm font-medium">Record an attempt</summary>
                      <div className="mt-2">
                        <EvidenceForm
                          studentId={student.id}
                          lessonId={lesson.id}
                          activityId={a.id}
                          objectives={[{ id: obj.id, title: obj.title, errorTags: obj.errorTags }]}
                          defaultObjectiveId={obj.id}
                          vocabulary={version.errorTagVocabulary}
                          allowType={a.activityType === "ASSESSMENT"}
                          compact
                        />
                      </div>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
        <div className="space-y-6">
          {lesson.status === "IN_PROGRESS" && canRun ? (
            <>
              <Section title="Finish">
                <ActionForm action={completeLessonAction} submitLabel="Complete lesson and generate report">
                  <input type="hidden" name="studentId" value={student.id} />
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <Field label="Actual minutes (optional)">
                    <input name="actualDurationMinutes" type="number" min={1} max={240} className="input" />
                  </Field>
                  <Field label="Teacher note (optional)" hint="Anything you noticed. Stored as an observation, never as a fact about the child.">
                    <textarea name="teacherNote" rows={3} className="input" maxLength={4000} />
                  </Field>
                </ActionForm>
              </Section>
              <Section title="Add a note now">
                <ActionForm action={teacherNoteAction} submitLabel="Save note" variant="secondary">
                  <input type="hidden" name="studentId" value={student.id} />
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <textarea name="text" rows={2} className="input" required maxLength={4000} />
                </ActionForm>
              </Section>
            </>
          ) : null}
          <Section title={`Event log · ${events.length}`}>
            <ol className="max-h-80 space-y-1 overflow-auto text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span>
                    <span className="font-mono">{e.sequence}</span> {e.eventType.toLowerCase().replace(/_/g, " ")}
                    {e.eventType === "TEACHER_NOTE" ? `: ${String((e.payload as { text?: string }).text ?? "")}` : ""}
                  </span>
                  <span className="text-muted">{formatDateTime(e.occurredAt, student.timezone)}</span>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </>
  );
}

function TeachingNotes({ notes }: { notes: Record<string, unknown> }) {
  const lists = ["vocabulary", "structures", "example_prompts", "activity_ideas", "success_criteria"] as const;
  return (
    <div className="mt-2 space-y-2">
      {lists.map((k) => {
        const v = notes[k];
        if (!Array.isArray(v) || v.length === 0) return null;
        return (
          <div key={k}>
            <p className="font-medium">{k.replace("_", " ")}</p>
            <p className="text-muted">{(v as string[]).join(" · ")}</p>
          </div>
        );
      })}
    </div>
  );
}
