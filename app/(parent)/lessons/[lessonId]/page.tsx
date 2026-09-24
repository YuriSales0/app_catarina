import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getLesson } from "@/lib/lessons/service";
import { getStudent } from "@/lib/students/service";
import { resolveLessonStudent } from "@/lib/lessons/resolve";
import { proposalFromPayload } from "@/lib/lessons/play";
import { PageHeader, Section, Field, Details, formatDateTime, StatusBadge, ToneChip } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { EvidenceForm } from "@/components/parent/evidence-form";
import { startLessonAction, cancelLessonAction, completeLessonAction, teacherNoteAction, requestAiContentAction } from "../actions";
import { getAIProvider } from "@/lib/ai";
import { hasAiConsent } from "@/lib/lessons/ai-proposals";
import { roleAllows } from "@/lib/authorization/permissions";
import { z } from "zod";
import type { NextLessonPlan } from "@/schemas/lesson-plan";
import { ACTIVITY, LESSON_STATUS, RESULT, TONE } from "@/lib/copy/pt";
import { Avatar, avatarOf } from "@/components/brand/avatar";

export const metadata = { title: "Aula" };

const NOTE_LABEL: Record<string, string> = { vocabulary: "Vocabulário", structures: "Estruturas", example_prompts: "Exemplos de perguntas", activity_ideas: "Ideias de atividade", success_criteria: "Critérios de sucesso" };

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
      .map((e) => proposalFromPayload(e.payload))
      .filter((p): p is NonNullable<typeof p> => p !== null);
  const canRun = roleAllows(access.role, "RUN_LESSON");
  const open = lesson.status !== "COMPLETED" && lesson.status !== "CANCELLED";
  const plan = lesson.planPayload as unknown as NextLessonPlan;
  const objectiveById = new Map(objectives.map((o) => [o.id, o]));
  const evidenceByActivity = (id: string) => evidence.filter((e) => e.activityId === id);

  return (
    <>
      <PageHeader
        leading={<Avatar choice={avatarOf(student)} size="lg" />}
        eyebrow={`Aula ${lesson.lessonNumber} · ${LESSON_STATUS[lesson.status]}`}
        title={primaryObjective.title}
        crumbs={[
          { href: "/students", label: "Crianças" },
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subject.id}`, label: subject.name },
        ]}
        subtitle={
          <>
            {lesson.plannedDurationMinutes} min planejados · {plan.source === "MANUAL" ? "escolhida por um adulto" : `escolhida pelo planejador (${lesson.planEngineVersion})`}
            {lesson.startedAt ? ` · começou ${formatDateTime(lesson.startedAt, student.timezone)}` : ""}
          </>
        }
        actions={
          <>
            {open && canRun ? (
              <Link href={`/play/${lesson.id}`} className="btn btn-soft">
                <span aria-hidden>🦉</span> Modo criança
              </Link>
            ) : null}
            {lesson.status === "PLANNED" && canRun ? (
              <form action={startLessonAction}>
                <input type="hidden" name="studentId" value={student.id} />
                <input type="hidden" name="lessonId" value={lesson.id} />
                <button type="submit" className="btn btn-primary">
                  Começar aula
                </button>
              </form>
            ) : null}
            {report ? (
              <Link href={`/lessons/${lesson.id}/report`} className="btn btn-primary">
                Como foi a aula
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          {plan.primary_objective ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              Objetivo principal: <strong>{plan.primary_objective.title}</strong> <StatusBadge status={plan.primary_objective.status} />
              {plan.review_objectives.length ? <span className="text-muted">· Revisão: {plan.review_objectives.map((r) => r.title).join(", ")}</span> : null}
            </p>
          ) : null}
          <ol className="space-y-4">
            {activities.map((a) => {
              const obj = a.objectiveId ? objectiveById.get(a.objectiveId) : null;
              const rows = evidenceByActivity(a.id);
              const meta = ACTIVITY[a.activityType];
              return (
                <li key={a.id} className="card space-y-3" data-activity={a.activityType}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-3 font-display text-lg font-semibold">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-2xl text-xl ${TONE[meta.tone].bg}`} aria-hidden>
                        {meta.emoji}
                      </span>
                      {a.sequence}. {meta.adult} <span className="text-sm font-normal text-muted">· {a.plannedMinutes} min</span>
                    </h2>
                    <span className="text-xs text-muted">
                      {rows.length}
                      {a.expectedEvidenceCount ? ` de ~${a.expectedEvidenceCount}` : ""} tentativas registradas
                    </span>
                  </div>
                  <p className="text-sm">{a.instructions}</p>
                  {obj ? (
                    <Details summary={`Notas de ensino: ${obj.title}`}>
                      <TeachingNotes notes={obj.teachingNotes} />
                    </Details>
                  ) : null}
                  {rows.length ? (
                    <ul className="space-y-1 text-xs">
                      {rows.map((e) => (
                        <li key={e.id} className="flex justify-between gap-2 rounded-xl bg-surface-2 px-3 py-1.5">
                          <span>
                            <ToneChip tone={e.result === "CORRECT" ? "mint" : e.result === "PARTIALLY_CORRECT" ? "sun" : e.result === "INCORRECT" ? "peach" : "neutral"}>{RESULT[e.result]}</ToneChip> {e.prompt}
                            {e.studentResponse ? ` → "${e.studentResponse}"` : ""}
                            {e.errorTags.length ? ` · ${e.errorTags.join(", ")}` : ""}
                          </span>
                          <span className="text-muted">#{e.attemptNumber}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {proposalsFor(a.id).map(({ proposal: p }, i) => (
                    <div key={i} className="rounded-2xl bg-lavender p-4 text-sm">
                      <p className="eyebrow text-lavender-ink">Sugestão da IA (como ensinar, não o que foi aprendido)</p>
                      <p className="mt-1 font-bold">{p.title}</p>
                      <p>{p.child_facing_intro}</p>
                      <ol className="mt-2 list-decimal space-y-0.5 pl-5">
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
                    <ActionForm action={requestAiContentAction} submitLabel="Pedir atividade à IA" variant="soft" size="sm" className="space-y-2">
                      <input type="hidden" name="studentId" value={student.id} />
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <input type="hidden" name="activityId" value={a.id} />
                    </ActionForm>
                  ) : null}
                  {lesson.status === "IN_PROGRESS" && canRun && obj && a.activityType !== "EXPLANATION" ? (
                    <details className="rounded-2xl border border-border/80 px-4 py-3" open={rows.length < (a.expectedEvidenceCount ?? 1)}>
                      <summary className="cursor-pointer text-sm font-bold">Registrar uma tentativa</summary>
                      <div className="mt-3">
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
              <Section title="Encerrar a aula" className="bg-primary-soft">
                <ActionForm action={completeLessonAction} submitLabel="Concluir aula e gerar relatório">
                  <input type="hidden" name="studentId" value={student.id} />
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <Field label="Minutos de verdade (opcional)">
                    <input name="actualDurationMinutes" type="number" min={1} max={240} className="input" />
                  </Field>
                  <Field label="Anotação (opcional)" hint="O que você percebeu. Fica guardado como observação, nunca como um fato sobre a criança.">
                    <textarea name="teacherNote" rows={3} className="input" maxLength={4000} />
                  </Field>
                </ActionForm>
              </Section>
              <Section title="Anotar agora">
                <ActionForm action={teacherNoteAction} submitLabel="Salvar anotação" variant="secondary">
                  <input type="hidden" name="studentId" value={student.id} />
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <textarea name="text" rows={2} className="input" required maxLength={4000} aria-label="Anotação" />
                </ActionForm>
              </Section>
            </>
          ) : null}
          <Details summary={`Registro técnico · ${events.length} eventos`}>
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
          </Details>
          <div className="flex flex-wrap gap-2">
            <Link href={`/lessons/${lesson.id}/context`} className="btn btn-ghost btn-sm">
              Context Pack (dados para a IA)
            </Link>
            {open && canRun ? (
              <form action={cancelLessonAction}>
                <input type="hidden" name="studentId" value={student.id} />
                <input type="hidden" name="lessonId" value={lesson.id} />
                <button type="submit" className="btn btn-danger btn-sm">
                  Cancelar aula
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function TeachingNotes({ notes }: { notes: Record<string, unknown> }) {
  const lists = ["vocabulary", "structures", "example_prompts", "activity_ideas", "success_criteria"] as const;
  return (
    <div className="space-y-2">
      {lists.map((k) => {
        const v = notes[k];
        if (!Array.isArray(v) || v.length === 0) return null;
        return (
          <div key={k}>
            <p className="font-bold">{NOTE_LABEL[k]}</p>
            <p className="text-muted">{(v as string[]).join(" · ")}</p>
          </div>
        );
      })}
    </div>
  );
}
