import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent, getEnrolment } from "@/lib/students/service";
import { getStudentProgress } from "@/lib/learning/progress";
import { listLessons } from "@/lib/lessons/service";
import { PageHeader, DemoBadge, DemoNotice, Section, Field, Details, formatDateTime, EmptyState, ProgressRing } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { ObjectiveList } from "@/components/parent/objective-list";
import { EvidenceForm } from "@/components/parent/evidence-form";
import { createManualLessonAction } from "@/app/(parent)/lessons/actions";
import { startTodayAction } from "@/app/(parent)/lessons/today-actions";
import { roleAllows } from "@/lib/authorization/permissions";
import { listRecommendations } from "@/lib/recommendations/service";
import { Recommendations } from "@/components/parent/recommendations";
import { Avatar, avatarOf } from "@/components/brand/avatar";
import { describeLevel } from "@/lib/curriculum/levels";
import { LESSON_STATUS, STATUS } from "@/lib/copy/pt";

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
  const level = enrolment.curriculumName ? describeLevel(enrolment.curriculumName) : null;

  return (
    <>
      <PageHeader
        leading={<Avatar choice={avatarOf(student)} size="lg" />}
        title={`${student.name} · ${enrolment.subjectName}`}
        crumbs={[
          { href: "/students", label: "Crianças" },
          { href: `/students/${student.id}`, label: student.name },
        ]}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {level ? `Trilha ${level.title}${level.cefr ? ` (${level.cefr})` : ""}` : "Nível não escolhido"} <DemoBadge show={student.isDemo || Boolean(enrolment.curriculumIsDemo)} />
          </span>
        }
        actions={
          progress ? (
            <>
              <Link href={`/students/${student.id}/subjects/${subjectId}/progress`} className="btn btn-secondary">
                📈 Desenvolvimento
              </Link>
              <Link href={`/students/${student.id}/subjects/${subjectId}/next-lesson`} className="btn btn-primary">
                Próxima aula
              </Link>
            </>
          ) : null
        }
      />
      <DemoNotice show={student.isDemo} />
      {!progress ? (
        <EmptyState title="Falta escolher o nível">
          <Link href={`/students/${student.id}`} className="btn btn-primary mt-2">
            Ir para o perfil
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Section
            title="Trilha"
            aside={
              <span className="text-xs text-muted">
                {progress.summary.MASTERED} {STATUS.MASTERED.label.toLowerCase()} · {progress.summary.PROFICIENT} {STATUS.PROFICIENT.label.toLowerCase()} · {progress.summary.unlocked} liberados
              </span>
            }
          >
            <ObjectiveList progress={progress} studentId={student.id} />
          </Section>
          <div className="space-y-6">
            <section className="card flex items-center gap-5 bg-primary-soft">
              <ProgressRing value={progress.summary.MASTERED + progress.summary.PROFICIENT} total={progress.summary.total} label="da trilha" />
              <div className="min-w-0">
                {inProgress ? (
                  <>
                    <p className="eyebrow text-primary-strong">{inProgress.status === "IN_PROGRESS" ? "Aula em andamento" : "Aula planejada"}</p>
                    <p className="font-display text-lg font-semibold">
                      Aula {inProgress.lessonNumber}: {inProgress.primaryObjectiveTitle}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/play/${inProgress.id}`} className="btn btn-primary btn-sm">
                        Com a criança
                      </Link>
                      <Link href={`/lessons/${inProgress.id}`} className="btn btn-secondary btn-sm">
                        Visão do adulto
                      </Link>
                    </div>
                  </>
                ) : canRun ? (
                  <>
                    <p className="eyebrow text-primary-strong">Aula de hoje</p>
                    <p className="text-sm text-muted">O planejador escolhe o próximo passo.</p>
                    <form action={startTodayAction} className="mt-3">
                      <input type="hidden" name="studentId" value={student.id} />
                      <input type="hidden" name="subjectId" value={subjectId} />
                      <input type="hidden" name="surface" value="play" />
                      <button type="submit" className="btn btn-primary btn-sm">
                        Começar aula →
                      </button>
                    </form>
                  </>
                ) : null}
              </div>
            </section>

            {recommendations.length ? (
              <Section title="Sugestões do planejador">
                <Recommendations studentId={student.id} items={recommendations} canDecide={canRun} />
              </Section>
            ) : null}

            <Section title="Aulas recentes">
              {lessons.length === 0 ? <p className="text-sm text-muted">Nenhuma aula ainda.</p> : null}
              <ul className="space-y-1.5 text-sm">
                {lessons.map((l) => (
                  <li key={l.id}>
                    <Link href={l.status === "COMPLETED" ? `/lessons/${l.id}/report` : `/lessons/${l.id}`} className="flex items-center justify-between gap-2 rounded-2xl px-3 py-2 hover:bg-surface-2">
                      <span className="font-bold">
                        Aula {l.lessonNumber}: <span className="font-normal">{l.primaryObjectiveTitle}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {LESSON_STATUS[l.status]} · {formatDateTime(l.completedAt ?? l.startedAt ?? l.createdAt, student.timezone)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>

            {canRun ? (
              <Details summary="Montar uma aula escolhendo o objetivo">
                <p className="mb-3 text-xs text-muted">Só aparecem objetivos liberados: a regra do que vem antes vale para adultos também.</p>
                <ActionForm action={createManualLessonAction} submitLabel="Criar aula" variant="primary">
                  <input type="hidden" name="studentId" value={student.id} />
                  <input type="hidden" name="subjectId" value={subjectId} />
                  <Field label="Objetivo principal">
                    <select name="primaryObjectiveId" className="input" required defaultValue={unlocked[0]?.objective.id ?? ""}>
                      {unlocked.map((o) => (
                        <option key={o.objective.id} value={o.objective.id}>
                          {o.objective.code} · {o.objective.title} ({STATUS[o.status].label.toLowerCase()})
                        </option>
                      ))}
                    </select>
                  </Field>
                  {reviewable.length ? (
                    <Field label="Revisar também (opcional, até dois)">
                      <select name="reviewObjectiveIds" className="input" multiple size={Math.min(4, reviewable.length)}>
                        {reviewable.map((o) => (
                          <option key={o.objective.id} value={o.objective.id}>
                            {o.objective.code} · {o.objective.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                  <Field label="Minutos">
                    <input name="plannedDurationMinutes" type="number" min={5} max={90} defaultValue={enrolment.plannedLessonMinutes} className="input" />
                  </Field>
                </ActionForm>
              </Details>
            ) : null}
            {canRun ? (
              <Details summary="Registrar prática feita fora da aula">
                <p className="mb-3 text-xs text-muted">Exercício no papel, conversa no carro. Conta como evidência, marcada como relato do responsável.</p>
                <EvidenceForm
                  studentId={student.id}
                  objectives={progress.objectives.filter((o) => o.unlock.unlocked).map((o) => ({ id: o.objective.id, title: `${o.objective.code} · ${o.objective.title}`, errorTags: o.objective.errorTags }))}
                  vocabulary={progress.version.errorTagVocabulary}
                  compact
                />
              </Details>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
