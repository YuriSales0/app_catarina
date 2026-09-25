import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent, getEnrolment } from "@/lib/students/service";
import { getNextLessonPlan } from "@/lib/learning/next-lesson";
import { PageHeader, Section, StatusBadge, DemoBadge } from "@/components/ui";
import { PlanRationale } from "@/components/parent/plan-rationale";
import { roleAllows } from "@/lib/authorization/permissions";
import { ACTIVITY, PLAN_OUTCOME, TONE } from "@/lib/copy/pt";
import { startTodayAction } from "@/app/(parent)/lessons/today-actions";
import { getStartingPoint } from "@/lib/lessons/starting-point";
import { StartingPointPanel } from "@/components/parent/starting-point";
import { describeLevel } from "@/lib/curriculum/levels";

export const metadata = { title: "Próxima aula" };

export default async function NextLessonPage(props: { params: Promise<{ studentId: string; subjectId: string }> }) {
  const { studentId, subjectId } = await props.params;
  const actor = await requireActor();
  const { access, student, enrolment, plan, placement } = await or404(async () => {
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [student, enrolment, plan, placement] = await Promise.all([getStudent(access), getEnrolment(access, subjectId), getNextLessonPlan(access, subjectId), getStartingPoint(access, subjectId)]);
    return { access, student, enrolment, plan, placement };
  });
  const canRun = roleAllows(access.role, "RUN_LESSON");
  const totalMinutes = plan.activities.reduce((a, b) => a + b.planned_minutes, 0);
  const hidden = (surface: "play" | "lesson" | "chatgpt") => (
    <>
      <input type="hidden" name="studentId" value={student.id} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <input type="hidden" name="surface" value={surface} />
    </>
  );

  return (
    <>
      <PageHeader
        eyebrow="Próxima aula"
        title={plan.outcome === "PLANNED" && plan.primary_objective ? plan.primary_objective.title : (PLAN_OUTCOME[plan.outcome]?.title ?? "Próxima aula")}
        crumbs={[
          { href: "/students", label: "Crianças" },
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subjectId}`, label: enrolment.subjectName },
        ]}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            Escolhida pelo planejador a partir do currículo, do que {student.name} já mostrou e das revisões pendentes. Nenhuma IA participa desta escolha. <DemoBadge show={student.isDemo} />
          </span>
        }
      />
      {plan.outcome === "PLANNED" && plan.primary_objective ? (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Section title={plan.placement_test ? `Teste de nível · ${totalMinutes} min` : `Roteiro · ${totalMinutes} min`} aside={<StatusBadge status={plan.primary_objective.status} />}>
            {placement?.status === "RESULT_READY" ? (
              <StartingPointPanel studentId={student.id} subjectId={subjectId} placement={placement} levelKey={enrolment.curriculumName ? describeLevel(enrolment.curriculumName).key : null} canEdit={roleAllows(access.role, "MANAGE_ENROLMENT")} back={`/students/${student.id}/subjects/${subjectId}/next-lesson`} />
            ) : null}
            {plan.placement_test ? (
              <p className="rounded-2xl bg-sky px-4 py-3 text-sm text-sky-ink">
                <strong>Teste de nível.</strong> Perguntas rápidas de {plan.placement_test.units.length} módulos, do mais fácil ao mais difícil, sem ensinar e sem nota. No fim, o app sugere por onde começar e você confirma.
              </p>
            ) : null}
            {plan.opening ? (
              <p className="rounded-2xl bg-peach px-4 py-3 text-sm text-peach-ink">
                <strong>{plan.opening.kind === "COURSE_START" ? "Aula inaugural." : `Abertura do módulo "${plan.opening.unit_name}".`}</strong> Começa explicando como as aulas funcionam e os objetivos do módulo, com um diagnóstico rápido. Se o nível parecer errado, o relatório avisa.
              </p>
            ) : null}
            {plan.review_objectives.length ? (
              <p className="rounded-2xl bg-sky px-4 py-3 text-sm text-sky-ink">
                Também revisa: {plan.review_objectives.map((r) => `${r.title}${r.days_overdue !== null ? ` (${r.days_overdue} dias de atraso)` : ""}`).join(", ")}
              </p>
            ) : null}
            <ol className="space-y-3">
              {plan.activities.map((a) => {
                const meta = ACTIVITY[a.activity_type];
                return (
                  <li key={a.sequence} className="flex gap-4">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ${TONE[meta.tone].bg}`} aria-hidden>
                      {meta.emoji}
                    </span>
                    <div className="min-w-0 border-b border-border/60 pb-3">
                      <p className="font-bold">
                        {a.sequence}. {meta.adult} <span className="font-normal text-muted">· {a.planned_minutes} min</span>
                      </p>
                      <p className="text-sm text-muted">{a.instructions}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {canRun ? (
              <div className="flex flex-wrap gap-2 pt-2">
                <form action={startTodayAction}>
                  {hidden("play")}
                  <button type="submit" className="btn btn-primary btn-lg">
                    Começar com a criança →
                  </button>
                </form>
                <form action={startTodayAction}>
                  {hidden("lesson")}
                  <button type="submit" className="btn btn-secondary btn-lg">
                    Conduzir pela visão do adulto
                  </button>
                </form>
                <form action={startTodayAction}>
                  {hidden("chatgpt")}
                  <button type="submit" className="btn btn-soft btn-lg">
                    Fazer no ChatGPT
                  </button>
                </form>
              </div>
            ) : null}
          </Section>
          <PlanRationale plan={plan} studentId={student.id} subjectId={subjectId} />
        </div>
      ) : (
        <Section title={PLAN_OUTCOME[plan.outcome]?.title ?? plan.outcome}>
          <p className="text-sm text-muted">{PLAN_OUTCOME[plan.outcome]?.text}</p>
          {plan.outcome === "BLOCKED" && plan.blocking_objectives.length ? (
            <ul className="space-y-2 text-sm">
              {plan.blocking_objectives.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/students/${student.id}/subjects/${subjectId}/objectives/${b.id}`} className="font-bold text-primary hover:underline">
                    {b.title}
                  </Link>
                  <StatusBadge status={b.status} /> precisa avançar primeiro.
                </li>
              ))}
            </ul>
          ) : null}
          {plan.outcome === "REVIEW_ONLY" ? (
            <ul className="space-y-1 text-sm">
              {plan.review_objectives.map((r) => (
                <li key={r.id}>
                  {r.title}: {r.days_overdue} dias de atraso
                </li>
              ))}
            </ul>
          ) : null}
          {plan.outcome === "NEEDS_CURRICULUM" ? (
            <Link href={`/students/${student.id}`} className="btn btn-primary">
              Escolher nível
            </Link>
          ) : null}
        </Section>
      )}
    </>
  );
}
