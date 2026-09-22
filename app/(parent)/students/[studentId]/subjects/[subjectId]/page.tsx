import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent, getEnrolment } from "@/lib/students/service";
import { PageHeader, DemoBadge } from "@/components/ui";

export default async function StudentSubjectPage(props: { params: Promise<{ studentId: string; subjectId: string }> }) {
  const { studentId, subjectId } = await props.params;
  const actor = await requireActor();
  const { student, enrolment } = await or404(async () => {
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [student, enrolment] = await Promise.all([getStudent(access), getEnrolment(access, subjectId)]);
    return { student, enrolment };
  });
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
            {enrolment.curriculumName ? `${enrolment.curriculumName} v${enrolment.curriculumVersion}` : "No curriculum chosen"} <DemoBadge show={student.isDemo} />
          </>
        }
      />
      <p className="text-sm text-muted">Objectives, evidence and lessons appear here from Phase 6.</p>
    </>
  );
}
