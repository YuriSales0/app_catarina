import Link from "next/link";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { resolveLessonStudent } from "@/lib/lessons/resolve";
import { getLesson } from "@/lib/lessons/service";
import { getStudent } from "@/lib/students/service";
import { buildLessonContext } from "@/lib/context/build";
import { PageHeader, Section } from "@/components/ui";
import { CONTEXT_CAPS } from "@/schemas/context-pack";
import { TEACHER_CONTRACT_VERSION, TEACHER_CONTRACT_RULES } from "@/lib/ai/contracts/teacher-contract.v1";
import { ValidationError } from "@/lib/authorization/errors";

/** What an AI would be given for this lesson, and nothing else. */
export default async function LessonContextPage(props: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await props.params;
  const actor = await requireActor();
  const { student, lesson, subject, built, problem } = await or404(async () => {
    z.string().uuid().parse(lessonId);
    const studentId = await resolveLessonStudent(lessonId);
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [detail, student] = await Promise.all([getLesson(access, lessonId), getStudent(access)]);
    let built = null;
    let problem: string | null = null;
    try {
      built = await buildLessonContext(access, detail.lesson.subjectId, lessonId);
    } catch (err) {
      if (err instanceof ValidationError) problem = err.message;
      else throw err;
    }
    return { student, lesson: detail.lesson, subject: detail.subject, built, problem };
  });
  const json = built ? JSON.stringify(built.pack, null, 2) : null;
  const bytes = json ? Buffer.byteLength(json) : 0;

  return (
    <>
      <PageHeader
        title={`Context pack · Lesson ${lesson.lessonNumber}`}
        crumbs={[
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subject.id}`, label: subject.name },
          { href: `/lessons/${lesson.id}`, label: `Lesson ${lesson.lessonNumber}` },
        ]}
        subtitle={built ? `${built.pack.context_version} · ${bytes} bytes · ${built.pack.relevant_recent_evidence.length} evidence rows · handles instead of ids` : "Could not build a pack"}
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Section title="Exactly what an AI teacher would receive">
          {problem ? <p className="text-sm text-danger">{problem}</p> : null}
          {json ? <pre className="max-h-[70vh] overflow-auto rounded-md border border-border bg-background p-3 text-xs">{json}</pre> : null}
        </Section>
        <div className="space-y-6">
          <Section title="Deliberately excluded">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Database ids: every reference is a per-pack handle (obj_1, ev_3) resolved server-side.</li>
              <li>Surname and date of birth: only a given name and an age in years.</li>
              <li>Other subjects, other students, guardians.</li>
              <li>Earlier inferences and recommendations: a model never reads what a model previously guessed.</li>
              <li>The full evidence history: at most {CONTEXT_CAPS.evidence} rows for this objective and its prerequisites.</li>
              <li>Internal scores, rule versions and engine weights.</li>
            </ul>
          </Section>
          <Section title={`Teacher contract · ${TEACHER_CONTRACT_VERSION}`}>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
              {TEACHER_CONTRACT_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </Section>
          <p className="text-xs text-muted">
            <Link href={`/lessons/${lesson.id}`} className="underline">
              Back to the lesson
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
