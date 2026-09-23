import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent, getEnrolment } from "@/lib/students/service";
import { getStudentProgress } from "@/lib/learning/progress";
import { listLessons } from "@/lib/lessons/service";
import { PageHeader, DemoBadge, DemoNotice, Section, Field, formatDateTime, EmptyState } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { ObjectiveList } from "@/components/parent/objective-list";
import { EvidenceForm } from "@/components/parent/evidence-form";
import { createManualLessonAction } from "@/app/(parent)/lessons/actions";
import { roleAllows } from "@/lib/authorization/permissions";
import { listRecommendations } from "@/lib/recommendations/service";
import { Recommendations } from "@/components/parent/recommendations";

export default async function StudentSubjectPage(props: { params: Promise<{ studentId: string; subjectId: string }> }) {
  const { studentId, subjectId } = await props.params;
  const actor = await requireActor();
  const data = await or404(async () => {
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [student, enrolment] = await Promise.all([getStudent(access), getEnrolment(access, subjectId)]);
    const progress = enrolment.curriculumVersionId ? await getStudentProgress(access, subjectId) : null;
    const [lessons, recommendations] = await Promise.all([listLessons(access, subjectId, 10), listRecommendations(access, { subjectId, status: "PROPOSED", limit: 6 })]);
    return { access, student, enrolment, progress, lessons, recommendations };
  });
  const { access, student, enrolment, progress, lessons, recommendations } = data;
  const canRun = roleAllows(access.role, "RUN_LESSON");
  const unlocked = progress?.objectives.filter((o) => o.unlock.unlocked && o.status !== "MASTERED") ?? [];
  const reviewable = progress?.objectives.filter((o) => o.status === "PROFICIENT" || o.status === "MASTERED") ?? [];
  const inProgress = lessons.find((l) => l.status === "IN_PROGRESS" || l.status === "PLANNED");

  return (
    <>
      <PageHeader
        title={`${student.name} · ${enrolment.subjectName}`}
        crumbs={[
          { href: "/students", label: "Students" },
          { href: `/students/${student.id}`, label: student.name },
        ]}
        subtitle={
          <>
            {enrolment.curriculumName ? `${enrolment.curriculumName} v${enrolment.curriculumVersion}` : "No curriculum chosen"} <DemoBadge show={student.isDemo || Boolean(enrolment.curriculumIsDemo)} />
          </>
        }
        actions={
          progress ? (
            <>
              <Link href={`/students/${student.id}/subjects/${subjectId}/progress`} className="btn btn-secondary">
                Progress
              </Link>
              <Link href={`/students/${student.id}/subjects/${subjectId}/next-lesson`} className="btn btn-primary">
                Next lesson
              </Link>
            </>
          ) : null
        }
      />
      <DemoNotice show={student.isDemo} />
      {!progress ? (
        <EmptyState title="Choose a curriculum first">
          <Link href={`/students/${student.id}`} className="underline">
            Go to the student profile to enrol in a published curriculum.
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-6">
            <Section title={`Objectives · ${progress.summary.total}`}>
              <p className="text-sm text-muted">
                {progress.summary.MASTERED} mastered · {progress.summary.PROFICIENT} proficient · {progress.summary.DEVELOPING} developing · {progress.summary.PRACTISING} practising · {progress.summary.INTRODUCED} introduced ·{" "}
                {progress.summary.NOT_STARTED} not started · {progress.summary.unlocked} available · {progress.summary.dueForReview} due for review
              </p>
              <ObjectiveList progress={progress} studentId={student.id} />
            </Section>
          </div>
          <div className="space-y-6">
            {inProgress ? (
              <Section title={inProgress.status === "IN_PROGRESS" ? "Lesson in progress" : "Planned lesson"}>
                <p className="text-sm">
                  Lesson {inProgress.lessonNumber}: {inProgress.primaryObjectiveTitle}
                </p>
                <Link href={`/lessons/${inProgress.id}`} className="btn btn-primary">
                  Open lesson
                </Link>
              </Section>
            ) : null}
            {canRun ? (
              <Section title="Start a lesson by hand">
                <p className="text-sm text-muted">Pick an available objective. Locked objectives are not offered; the prerequisite rule applies to people as well as to the engine.</p>
                <ActionForm action={createManualLessonAction} submitLabel="Create lesson" variant="secondary">
                  <input type="hidden" name="studentId" value={student.id} />
                  <input type="hidden" name="subjectId" value={subjectId} />
                  <Field label="Main objective">
                    <select name="primaryObjectiveId" className="input" required defaultValue={unlocked[0]?.objective.id ?? ""}>
                      {unlocked.map((o) => (
                        <option key={o.objective.id} value={o.objective.id}>
                          {o.objective.code} · {o.objective.title} ({o.status.toLowerCase().replace("_", " ")})
                        </option>
                      ))}
                    </select>
                  </Field>
                  {reviewable.length ? (
                    <Field label="Also review (optional, up to two)">
                      <select name="reviewObjectiveIds" className="input" multiple size={Math.min(4, reviewable.length)}>
                        {reviewable.map((o) => (
                          <option key={o.objective.id} value={o.objective.id}>
                            {o.objective.code} · {o.objective.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                  <Field label="Minutes">
                    <input name="plannedDurationMinutes" type="number" min={5} max={90} defaultValue={enrolment.plannedLessonMinutes} className="input" />
                  </Field>
                </ActionForm>
              </Section>
            ) : null}
            {canRun ? (
              <Section title="Record practice done outside a lesson">
                <p className="text-sm text-muted">Paper exercises, a conversation in the car. Counts as evidence, marked as a parent report.</p>
                <EvidenceForm
                  studentId={student.id}
                  objectives={progress.objectives.filter((o) => o.unlock.unlocked).map((o) => ({ id: o.objective.id, title: `${o.objective.code} · ${o.objective.title}`, errorTags: o.objective.errorTags }))}
                  vocabulary={progress.version.errorTagVocabulary}
                  compact
                />
              </Section>
            ) : null}
            {recommendations.length ? (
              <Section title="Recommended actions">
                <Recommendations studentId={student.id} items={recommendations} canDecide={canRun} />
              </Section>
            ) : null}
            <Section title="Recent lessons">
              {lessons.length === 0 ? <p className="text-sm text-muted">No lessons yet.</p> : null}
              <ul className="space-y-1 text-sm">
                {lessons.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2">
                    <Link href={`/lessons/${l.id}`} className="hover:underline">
                      Lesson {l.lessonNumber}: {l.primaryObjectiveTitle}
                    </Link>
                    <span className="text-xs text-muted">
                      {l.status.toLowerCase().replace("_", " ")} · {formatDateTime(l.completedAt ?? l.startedAt ?? l.createdAt, student.timezone)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
