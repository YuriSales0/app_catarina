import Link from "next/link";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getLesson } from "@/lib/lessons/service";
import { getStudent } from "@/lib/students/service";
import { resolveLessonStudent } from "@/lib/lessons/resolve";
import { PageHeader, EmptyState, formatDateTime } from "@/components/ui";
import { lessonReportSchema } from "@/schemas/lesson-report";
import { ReportView } from "@/components/parent/report-view";
import { ActionForm } from "@/components/forms/action-form";
import { attachNarrativeAction } from "../../actions";
import { getAIProvider } from "@/lib/ai";
import { hasAiConsent } from "@/lib/lessons/ai-proposals";
import { roleAllows } from "@/lib/authorization/permissions";
import { Avatar, avatarOf } from "@/components/brand/avatar";
import { Lumi } from "@/components/brand/lumi";
import { getEnrolment } from "@/lib/students/service";
import { getStartingPoint } from "@/lib/lessons/starting-point";
import { StartingPointPanel } from "@/components/parent/starting-point";
import { describeLevel } from "@/lib/curriculum/levels";

export const metadata = { title: "Como foi a aula" };

const BY: Record<string, string> = { SYSTEM: "pelo sistema", AI_PROVIDER: "com comentário da IA", HUMAN: "por um adulto" };

export default async function LessonReportPage(props: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await props.params;
  const actor = await requireActor();
  const data = await or404(async () => {
    z.string().uuid().parse(lessonId);
    const studentId = await resolveLessonStudent(lessonId);
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [detail, student] = await Promise.all([getLesson(access, lessonId), getStudent(access)]);
    const [placement, enrolment] = await Promise.all([getStartingPoint(access, detail.lesson.subjectId), getEnrolment(access, detail.lesson.subjectId)]);
    return { access, detail, student, placement, enrolment };
  });
  const { access, detail, student, placement, enrolment } = data;
  const isLevelCheck = Boolean((detail.lesson.planPayload as { placement_test?: unknown }).placement_test);
  const [provider, aiConsent] = await Promise.all([getAIProvider(), hasAiConsent(student.id)]);
  const canNarrate = provider.id !== "null" && aiConsent && roleAllows(access.role, "RUN_LESSON") && detail.report?.generatedBy === "SYSTEM";
  const { lesson, subject, report, objectives, primaryObjective } = detail;
  const parsed = report ? lessonReportSchema.safeParse(report.payload) : null;

  return (
    <>
      <PageHeader
        leading={<Avatar choice={avatarOf(student)} size="lg" />}
        eyebrow="Como foi a aula"
        title={`Aula ${lesson.lessonNumber} · ${primaryObjective.title}`}
        crumbs={[
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subject.id}`, label: subject.name },
          { href: `/lessons/${lesson.id}`, label: `Aula ${lesson.lessonNumber}` },
        ]}
        subtitle={report ? `${formatDateTime(report.generatedAt, student.timezone)} · gerado ${BY[report.generatedBy] ?? report.generatedBy} · ${report.schemaVersion}` : "Ainda sem relatório"}
        actions={
          <Link href={`/students/${student.id}/subjects/${subject.id}/next-lesson`} className="btn btn-primary">
            Próxima aula →
          </Link>
        }
      />
      {!report || !parsed?.success ? (
        <EmptyState title="O relatório sai quando a aula termina">
          <Link href={`/lessons/${lesson.id}`} className="btn btn-secondary mt-2">
            Voltar para a aula
          </Link>
        </EmptyState>
      ) : (
        <>
          {isLevelCheck && placement?.result?.lesson_id === lesson.id ? (
            <div className="mb-6">
              <StartingPointPanel studentId={student.id} subjectId={subject.id} placement={placement} levelKey={enrolment.curriculumName ? describeLevel(enrolment.curriculumName).key : null} canEdit={roleAllows(access.role, "MANAGE_ENROLMENT")} back={`/students/${student.id}/subjects/${subject.id}/next-lesson`} />
            </div>
          ) : null}
          <ReportView report={parsed.data} objectives={objectives} studentId={student.id} subjectId={subject.id} />
          {canNarrate ? (
            <div className="card mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Lumi size={64} mood="think" />
              <div className="flex-1">
                <p className="font-display text-lg font-semibold">Quer um comentário da IA sobre esta aula?</p>
                <p className="text-xs text-muted">A parte &ldquo;O que aconteceu&rdquo; continua exatamente como foi calculada. O que a IA não conseguir apoiar nas tentativas desta aula é descartado.</p>
              </div>
              <ActionForm action={attachNarrativeAction} submitLabel="Pedir comentário da IA" variant="primary">
                <input type="hidden" name="studentId" value={student.id} />
                <input type="hidden" name="lessonId" value={lesson.id} />
              </ActionForm>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
