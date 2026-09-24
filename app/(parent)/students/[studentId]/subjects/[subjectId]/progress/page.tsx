import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent, getEnrolment } from "@/lib/students/service";
import { getStudentProgress } from "@/lib/learning/progress";
import { PageHeader, Section, StatusBadge, ProgressRing, StatTile, DemoBadge, formatDate } from "@/components/ui";
import { StageBar, ShareBars, WeeklyBars } from "@/components/parent/charts";
import { getLongTermProgress } from "@/lib/learning/long-term";
import { Avatar, avatarOf } from "@/components/brand/avatar";
import { describeLevel } from "@/lib/curriculum/levels";
import { STATUS, SKILL, TONE } from "@/lib/copy/pt";
import type { ObjectiveStatus } from "@/lib/db/enums";

export const metadata = { title: "Desenvolvimento" };

const SECURE: ObjectiveStatus[] = ["PROFICIENT", "MASTERED"];

const TREND: Record<string, { title: string; text: string; cls: string }> = {
  IMPROVING: { title: "Melhorando 📈", text: "O acerto das últimas duas semanas subiu em relação às duas anteriores.", cls: "bg-mint text-mint-ink" },
  STABLE: { title: "Estável", text: "O acerto está parecido nas últimas semanas. Constância é bom sinal.", cls: "bg-sky text-sky-ink" },
  DECLINING: { title: "Pedindo atenção", text: "O acerto caiu nas últimas duas semanas. As próximas aulas vão com mais calma.", cls: "bg-peach text-peach-ink" },
  INSUFFICIENT_DATA: { title: "Ainda cedo para tendência", text: "Com mais algumas aulas por semana, mostramos se está melhorando.", cls: "bg-surface-2 text-muted" },
};

/** The knowledge model for families: where the child is on the trail, by unit and by skill, and what changed recently. */
export default async function ProgressPage(props: { params: Promise<{ studentId: string; subjectId: string }> }) {
  const { studentId, subjectId } = await props.params;
  const actor = await requireActor();
  const { student, enrolment, progress, longTerm } = await or404(async () => {
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [student, enrolment, progress] = await Promise.all([getStudent(access), getEnrolment(access, subjectId), getStudentProgress(access, subjectId)]);
    const longTerm = await getLongTermProgress(access, subjectId, { secure: progress.summary.MASTERED + progress.summary.PROFICIENT, total: progress.summary.total }, student.timezone);
    return { student, enrolment, progress, longTerm };
  });
  const sum = progress.summary;
  const secure = sum.MASTERED + sum.PROFICIENT;
  const level = describeLevel(progress.curriculum.name);

  const units = new Map<string, typeof progress.objectives>();
  for (const o of progress.objectives) units.set(o.unit.id, [...(units.get(o.unit.id) ?? []), o]);

  const skills = new Map<string, { total: number; secure: number }>();
  for (const o of progress.objectives)
    for (const k of o.skills) {
      const cur = skills.get(k) ?? { total: 0, secure: 0 };
      cur.total++;
      if (SECURE.includes(o.status)) cur.secure++;
      skills.set(k, cur);
    }

  const titleOf = (id: string) => progress.objectives.find((o) => o.objective.id === id)?.objective.title ?? "Objetivo";
  const wins = progress.recentTransitions.filter((t) => STATUS[t.toStatus].order > STATUS[t.fromStatus].order).slice(0, 8);
  const reviewsDue = progress.objectives.filter((o) => o.reviewDue);
  const objectiveHref = (id: string) => `/students/${student.id}/subjects/${subjectId}/objectives/${id}`;

  return (
    <>
      <PageHeader
        leading={<Avatar choice={avatarOf(student)} size="lg" />}
        eyebrow="Desenvolvimento"
        title={`${student.name} · ${enrolment.subjectName}`}
        crumbs={[
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subjectId}`, label: enrolment.subjectName },
        ]}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            Trilha {level.title}
            {level.cefr ? ` (${level.cefr})` : ""} · {sum.total} objetivos <DemoBadge show={student.isDemo} />
          </span>
        }
        actions={
          <Link href={`/students/${student.id}/subjects/${subjectId}/next-lesson`} className="btn btn-primary">
            Próxima aula
          </Link>
        }
      />

      <section className="card mb-6 grid gap-6 lg:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-5">
          <ProgressRing value={secure} total={sum.total} size={110} label="firme" />
          <div>
            <p className="font-display text-2xl font-semibold">
              {secure} de {sum.total}
            </p>
            <p className="text-sm text-muted">objetivos já estão firmes</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatTile value={sum.unlocked} label="liberados" tone="sky" />
              <StatTile value={sum.dueForReview} label="revisões" tone={sum.dueForReview ? "peach" : "neutral"} />
            </div>
          </div>
        </div>
        <div className="self-center">
          <p className="eyebrow mb-3">Onde cada objetivo está</p>
          <StageBar counts={sum} total={sum.total} />
        </div>
      </section>

      <section className="card mb-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Últimas 6 semanas</h2>
            <span className="text-xs text-muted">acerto por semana</span>
          </div>
          <WeeklyBars weeks={longTerm.weekly} />
        </div>
        <div className="space-y-3 self-center">
          <p className={`rounded-2xl px-4 py-3 text-sm ${TREND[longTerm.trend].cls}`}>
            <strong className="block font-display text-lg">{TREND[longTerm.trend].title}</strong>
            {TREND[longTerm.trend].text}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <StatTile value={longTerm.lessons_last_30_days} label="aulas em 30 dias" tone="lavender" />
            <StatTile value={longTerm.secured_last_30_days} label="firmados em 30 dias" tone="mint" />
          </div>
          <p className="text-xs text-muted">
            {longTerm.first_lesson_at ? `Aprendendo desde ${formatDate(longTerm.first_lesson_at, student.timezone)} · ${longTerm.lessons_completed} {longTerm.lessons_completed === 1 ? "aula" : "aulas"} no total. ` : ""}Calculado pelo sistema a partir das tentativas; é o mesmo resumo que a IA recebe para ajustar o ritmo.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          {[...units.entries()].map(([unitId, rows]) => {
            const unitSecure = rows.filter((o) => SECURE.includes(o.status)).length;
            return (
              <section key={unitId} className="card space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold">{rows[0].unit.name}</h2>
                  <span className="text-xs text-muted tabular-nums">
                    {unitSecure} de {rows.length} firmes
                  </span>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {rows.map((o) => {
                    const s = STATUS[o.status];
                    return (
                      <li key={o.objective.id}>
                        <Link
                          href={objectiveHref(o.objective.id)}
                          title={`${s.label}${o.state ? ` · ${o.state.assessedAttempts} tentativas` : ""}${o.unlock.unlocked ? "" : " · bloqueado"}`}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition hover:-translate-y-0.5 ${TONE[s.tone].bg} ${TONE[s.tone].ink} ${o.unlock.unlocked ? "" : "opacity-50"}`}
                        >
                          <span aria-hidden>{o.unlock.unlocked ? s.emoji : "🔒"}</span>
                          {o.objective.title}
                          <span className="sr-only"> ({s.label})</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="space-y-6">
          <Section title="Habilidades">
            <p className="-mt-2 text-xs text-muted">Objetivos firmes em cada habilidade.</p>
            <ShareBars rows={[...skills.entries()].map(([k, v]) => ({ label: SKILL[k.toLowerCase()] ?? k, value: v.secure, total: v.total }))} />
          </Section>

          <Section title="Conquistas recentes">
            {wins.length === 0 ? <p className="text-sm text-muted">As conquistas aparecem aqui conforme {student.name} avança.</p> : null}
            <ul className="space-y-2">
              {wins.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-xs text-muted">{formatDate(t.createdAt, student.timezone)}</span>
                  <Link href={objectiveHref(t.objectiveId)} className="font-bold hover:text-primary">
                    {titleOf(t.objectiveId)}
                  </Link>
                  <StatusBadge status={t.toStatus} short />
                </li>
              ))}
            </ul>
          </Section>

          {reviewsDue.length ? (
            <Section title="Pedem revisão">
              <ul className="space-y-1.5 text-sm">
                {reviewsDue.map((o) => (
                  <li key={o.objective.id} className="flex items-center justify-between gap-2">
                    <Link href={objectiveHref(o.objective.id)} className="font-bold hover:text-primary">
                      {o.objective.title}
                    </Link>
                    <span className="text-xs text-muted">desde {formatDate(o.review!.nextReviewAt!, student.timezone)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </>
  );
}
