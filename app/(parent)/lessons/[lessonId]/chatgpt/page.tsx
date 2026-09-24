import Link from "next/link";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { resolveLessonStudent } from "@/lib/lessons/resolve";
import { getLesson } from "@/lib/lessons/service";
import { buildExternalLesson } from "@/lib/lessons/external";
import { getStudent } from "@/lib/students/service";
import { PageHeader, Section } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { CopyButton } from "@/components/parent/copy-button";
import { submitExternalClosingAction } from "./actions";

export const metadata = { title: "Aula no ChatGPT" };

/**
 * Run the lesson in the family's own ChatGPT: copy the script, have the
 * lesson there (by voice), paste the closing back. The script is built from
 * the same plan, curriculum and progress summary as the in-app lesson.
 */
export default async function ExternalLessonPage(props: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await props.params;
  const actor = await requireActor();
  const { student, detail, external } = await or404(async () => {
    z.string().uuid().parse(lessonId);
    const access = await requireStudentAccess(actor, await resolveLessonStudent(lessonId), "RUN_LESSON");
    const [detail, student] = await Promise.all([getLesson(access, lessonId), getStudent(access)]);
    const open = detail.lesson.status === "PLANNED" || detail.lesson.status === "IN_PROGRESS";
    return { student, detail, external: open ? await buildExternalLesson(access, lessonId) : null };
  });
  const { lesson, subject, primaryObjective } = detail;

  return (
    <>
      <PageHeader
        eyebrow={`Aula ${lesson.lessonNumber} · no ChatGPT`}
        title={primaryObjective.title}
        crumbs={[
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subject.id}`, label: subject.name },
          { href: `/lessons/${lesson.id}`, label: `Aula ${lesson.lessonNumber}` },
        ]}
        subtitle={`Faça a aula na sua assinatura do ChatGPT, por voz, e traga o fechamento de volta para o progresso de ${student.name} continuar certinho.`}
      />
      {!external ? (
        <Section title="Esta aula já terminou">
          <Link href={`/lessons/${lesson.id}/report`} className="btn btn-primary">
            Ver como foi a aula
          </Link>
        </Section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-6">
            <Section title="1. Copie o roteiro da aula" aside={<CopyButton targetId="roteiro" />}>
              <p className="text-sm text-muted">
                O roteiro traz o plano de hoje, o jeito de ensinar do Lumi e o que {student.name} já sabe. Leva só o primeiro nome, a idade e o resumo do progresso: nada de sobrenome, contato ou dados de outras crianças.
              </p>
              <label htmlFor="roteiro" className="sr-only">
                Roteiro da aula
              </label>
              <textarea id="roteiro" readOnly rows={14} className="input font-mono text-xs leading-relaxed" defaultValue={external.prompt} />
            </Section>

            <Section title="3. Cole aqui o fechamento">
              <p className="text-sm text-muted">
                No fim da aula, o ChatGPT escreve um bloco de fechamento. Copie a resposta dele (pode copiar a mensagem inteira) e cole abaixo. O código desta aula é <strong className="font-mono">{external.code}</strong>.
              </p>
              <ActionForm action={submitExternalClosingAction} submitLabel="Registrar o fechamento" size="lg">
                <input type="hidden" name="lessonId" value={lesson.id} />
                <label htmlFor="closing" className="sr-only">
                  Fechamento do ChatGPT
                </label>
                <textarea id="closing" name="closing" required rows={10} className="input font-mono text-xs" placeholder={'```json\n{ "format": "learning-os-closing.v1", "lesson_code": "' + external.code + '", ... }\n```'} />
              </ActionForm>
            </Section>
          </div>

          <div className="space-y-6">
            <Section title="2. Faça a aula no ChatGPT">
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                <li>Abra uma conversa nova no ChatGPT e cole o roteiro.</li>
                <li>Envie e, quando ele responder, toque no botão de voz para {student.name} conversar com o Lumi.</li>
                <li>Deixe a aula acontecer. Você pode acompanhar ao lado.</li>
                <li>
                  No fim, o ChatGPT gera o fechamento. Se não gerar, saia do modo voz e escreva <strong>FECHAMENTO</strong>.
                </li>
              </ol>
              <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" className="btn btn-secondary mt-2">
                Abrir o ChatGPT ↗
              </a>
            </Section>
            <Section title="Como o fechamento entra no app">
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                <li>Cada tentativa vira um registro da aula, marcado como avaliado por IA externa, com confiança baixa. Sozinho, não faz um objetivo virar &ldquo;dominado&rdquo;.</li>
                <li>Respostas com gabarito são conferidas de novo pelo sistema.</li>
                <li>O resumo, o que foi bem, o que foi difícil e a sugestão para a próxima aula aparecem no relatório.</li>
                <li>Você pode corrigir qualquer registro depois, na página da aula.</li>
              </ul>
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
