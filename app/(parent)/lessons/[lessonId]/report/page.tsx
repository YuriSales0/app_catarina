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

export default async function LessonReportPage(props: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await props.params;
  const actor = await requireActor();
  const data = await or404(async () => {
    z.string().uuid().parse(lessonId);
    const studentId = await resolveLessonStudent(lessonId);
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [detail, student] = await Promise.all([getLesson(access, lessonId), getStudent(access)]);
    return { detail, student };
  });
  const { detail, student } = data;
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
        <ReportView report={parsed.data} objectives={objectives} studentId={student.id} subjectId={subject.id} />
      )}
    </>
  );
}
