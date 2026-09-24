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
        eyebrow="Dados para a IA"
        title={`Context Pack · Aula ${lesson.lessonNumber}`}
        crumbs={[
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subject.id}`, label: subject.name },
          { href: `/lessons/${lesson.id}`, label: `Aula ${lesson.lessonNumber}` },
        ]}
        subtitle={built ? `${built.pack.context_version} · ${bytes} bytes · ${built.pack.relevant_recent_evidence.length} tentativas · apelidos no lugar de ids` : "Não foi possível montar o pacote"}
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Section title="Exatamente o que uma IA professora receberia">
          {problem ? <p className="text-sm text-danger">{problem}</p> : null}
          {json ? <pre className="max-h-[70vh] overflow-auto rounded-md border border-border bg-background p-3 text-xs">{json}</pre> : null}
        </Section>
        <div className="space-y-6">
          <Section title="Fica de fora de propósito">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Ids do banco: cada referência é um apelido do pacote (obj_1, ev_3), resolvido no servidor.</li>
              <li>Sobrenome e data de nascimento: só o primeiro nome e a idade em anos.</li>
              <li>Outras matérias, outras crianças e responsáveis.</li>
              <li>Interpretações e sugestões anteriores: um modelo nunca lê o que um modelo adivinhou antes.</li>
              <li>The full evidence history: at most {CONTEXT_CAPS.evidence} rows for this objective and its prerequisites.</li>
              <li>Pontuações internas, versões de regras e pesos do planejador.</li>
            </ul>
          </Section>
          <Section title={`Contrato do professor · ${TEACHER_CONTRACT_VERSION}`}>
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
