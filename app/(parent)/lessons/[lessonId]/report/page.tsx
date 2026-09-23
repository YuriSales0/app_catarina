import Link from "next/link";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getLesson } from "@/lib/lessons/service";
import { getStudent } from "@/lib/students/service";
import { resolveLessonStudent } from "@/lib/lessons/resolve";
import { PageHeader, Section, formatDateTime } from "@/components/ui";
import { lessonReportSchema } from "@/schemas/lesson-report";
import { ReportView } from "@/components/parent/report-view";
import { ActionForm } from "@/components/forms/action-form";
import { attachNarrativeAction } from "../../actions";
import { getAIProvider } from "@/lib/ai";
import { hasAiConsent } from "@/lib/lessons/ai-proposals";
import { roleAllows } from "@/lib/authorization/permissions";

export default async function LessonReportPage(props: { params: Promise<{ lessonId: string }> }) {
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
  const [provider, aiConsent] = await Promise.all([getAIProvider(), hasAiConsent(student.id)]);
  const canNarrate = provider.id !== "null" && aiConsent && roleAllows(access.role, "RUN_LESSON") && detail.report?.generatedBy === "SYSTEM";
  const { lesson, subject, report, objectives } = detail;
  const parsed = report ? lessonReportSchema.safeParse(report.payload) : null;

  return (
    <>
      <PageHeader
        title={`Report · Lesson ${lesson.lessonNumber}`}
        crumbs={[
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subject.id}`, label: subject.name },
          { href: `/lessons/${lesson.id}`, label: `Lesson ${lesson.lessonNumber}` },
        ]}
        subtitle={report ? `Generated ${formatDateTime(report.generatedAt, student.timezone)} by ${report.generatedBy.toLowerCase().replace("_", " ")} · schema ${report.schemaVersion}` : "No report yet"}
      />
      {!report || !parsed?.success ? (
        <Section title="No report">
          <p className="text-sm text-muted">
            The report is generated when the lesson is completed.{" "}
            <Link href={`/lessons/${lesson.id}`} className="underline">
              Back to the lesson.
            </Link>
          </p>
        </Section>
      ) : (
        <>
          <ReportView report={parsed.data} objectives={objectives} studentId={student.id} subjectId={subject.id} />
          {canNarrate ? (
            <div className="mt-6 max-w-md">
              <ActionForm action={attachNarrativeAction} submitLabel="Add an AI narrative to the inferred and recommended sections" variant="secondary">
                <input type="hidden" name="studentId" value={student.id} />
                <input type="hidden" name="lessonId" value={lesson.id} />
                <p className="text-xs text-muted">The observed section stays exactly as computed. Anything the model cannot ground in this lesson&apos;s evidence is dropped and listed.</p>
              </ActionForm>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
