import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor, getDisplayName } from "@/lib/auth/session";
import { getDashboard, type StudentCard, type SubjectCard } from "@/lib/dashboard/service";
import { PageHeader, DemoBadge, StatusBadge, ProgressRing, Details, formatRelativeDay } from "@/components/ui";
import { Recommendations } from "@/components/parent/recommendations";
import { Avatar, avatarOf } from "@/components/brand/avatar";
import { roleAllows } from "@/lib/authorization/permissions";
import type { GuardianRole } from "@/lib/db/enums";
import { greeting, PLAN_OUTCOME, REASON } from "@/lib/copy/pt";
import { describeLevel } from "@/lib/curriculum/levels";
import { startTodayAction } from "@/app/(parent)/lessons/today-actions";

export const metadata = { title: "Início" };

export default async function DashboardPage() {
  const actor = await requireActor();
  const [cards, name] = await Promise.all([getDashboard(actor), getDisplayName()]);
  if (cards.length === 0) redirect("/boas-vindas");
  const tz = cards[0]?.timezone;

  return (
    <>
      <PageHeader
        eyebrow="Início"
        title={`${greeting(new Date(), tz)}${name ? `, ${name}` : ""}!`}
        subtitle="O dia de aprendizado das crianças, com um clique para começar."
        actions={
          <>
            <Link href="/criancas" className="btn btn-soft sm:hidden">
              <span aria-hidden>🦉</span> Modo criança
            </Link>
            <Link href="/boas-vindas" className="btn btn-secondary">
              Adicionar criança
            </Link>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        {cards.map((st) => (
          <ChildCard key={st.id} st={st} />
        ))}
      </div>
    </>
  );
}

function ChildCard({ st }: { st: StudentCard }) {
  const canRun = roleAllows(st.role as GuardianRole, "RUN_LESSON");
  const lessonsThisWeek = st.week.filter((d) => d.done).length;
  const main = st.subjects.find((s) => s.summary) ?? st.subjects[0] ?? null;
  const learned = main?.summary ? main.summary.MASTERED + main.summary.PROFICIENT : 0;

  return (
    <section aria-labelledby={`student-${st.id}`} className="card flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <Avatar choice={avatarOf(st)} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 id={`student-${st.id}`} className="flex flex-wrap items-center gap-2 font-display text-2xl font-semibold">
            <Link href={`/students/${st.id}`} className="hover:text-primary">
              {st.name}
            </Link>
            <DemoBadge show={st.isDemo} />
          </h2>
          <p className="text-sm text-muted">
            {st.age !== null ? `${st.age} anos` : "Idade não informada"}
            {main?.curriculumName ? ` · trilha ${describeLevel(main.curriculumName).title}` : ""}
          </p>
          <WeekStrip st={st} />
          <p className="mt-1 text-xs text-muted">{lessonsThisWeek === 0 ? "Nenhuma aula nos últimos 7 dias" : `${lessonsThisWeek} ${lessonsThisWeek === 1 ? "dia com aula" : "dias com aula"} nos últimos 7 dias`}</p>
        </div>
        {main?.summary ? <ProgressRing value={learned} total={main.summary.total} label="da trilha" /> : null}
      </div>

      {st.subjects.length === 0 ? (
        <div className="rounded-2xl bg-sun p-5">
          <p className="font-bold text-sun-ink">Falta escolher o nível de {st.name}.</p>
          <Link href={`/boas-vindas?passo=2&crianca=${st.id}`} className="btn btn-primary mt-3">
            Escolher nível
          </Link>
        </div>
      ) : null}

      {st.subjects.map((sub) => (
        <TodayPanel key={sub.subjectId} st={st} sub={sub} canRun={canRun} showSubject={st.subjects.length > 1} />
      ))}

      {main?.currentObjectives.length ? (
        <div>
          <p className="eyebrow mb-2">Em foco</p>
          <ul className="space-y-2">
            {main.currentObjectives.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 px-4 py-2.5 text-sm">
                <Link href={`/students/${st.id}/subjects/${main.subjectId}/objectives/${o.id}`} className="font-bold hover:text-primary">
                  {o.title}
                </Link>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {o.recentTotal ? `${o.recentCorrect} de ${o.recentTotal} recentes` : `${o.attempts} tentativas`}
                  <StatusBadge status={o.status} short />
                </span>
              </li>
            ))}
          </ul>
          {main.recurringDifficulties.length ? (
            <p className="mt-3 text-sm">
              <span className="font-bold text-peach-ink">Ponto de atenção: </span>
              {main.recurringDifficulties.map((d) => `${d.label} (${d.occurrences}×)`).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {st.recommendations.length ? (
        <Details summary={`Sugestões do planejador (${st.recommendations.length})`}>
          <Recommendations studentId={st.id} items={st.recommendations} canDecide={canRun} />
        </Details>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-border/70 pt-4 text-sm">
        {main ? (
          <Link href={`/students/${st.id}/subjects/${main.subjectId}/progress`} className="btn btn-ghost btn-sm">
            📈 Desenvolvimento
          </Link>
        ) : null}
        {main?.lastLesson ? (
          <Link href={`/lessons/${main.lastLesson.id}/report`} className="btn btn-ghost btn-sm">
            📝 Última aula ({formatRelativeDay(main.lastLesson.completedAt)})
          </Link>
        ) : null}
        <Link href={`/students/${st.id}/snapshots`} className="btn btn-ghost btn-sm">
          📸 Retratos
        </Link>
        <Link href={`/students/${st.id}`} className="btn btn-ghost btn-sm">
          ⚙️ Perfil
        </Link>
      </div>
    </section>
  );
}

function WeekStrip({ st }: { st: StudentCard }) {
  return (
    <ol className="mt-3 flex gap-1.5" aria-label="Últimos 7 dias">
      {st.week.map((d) => (
        <li key={d.date} className="flex flex-col items-center gap-1">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${d.done ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted"} ${d.today ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-surface" : ""}`}
            title={d.done ? "Teve aula" : "Sem aula"}
          >
            {d.done ? "★" : ""}
          </span>
          <span className="text-[10px] font-bold text-muted">{d.weekday}</span>
        </li>
      ))}
    </ol>
  );
}

function TodayPanel({ st, sub, canRun, showSubject }: { st: StudentCard; sub: SubjectCard; canRun: boolean; showSubject: boolean }) {
  const hidden = (surface: "play" | "lesson") => (
    <>
      <input type="hidden" name="studentId" value={st.id} />
      <input type="hidden" name="subjectId" value={sub.subjectId} />
      <input type="hidden" name="surface" value={surface} />
    </>
  );
  const planned = sub.next?.outcome === "PLANNED";
  const outcome = sub.next && !planned ? PLAN_OUTCOME[sub.next.outcome] : null;

  return (
    <div className="rounded-3xl bg-primary-soft p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow text-primary-strong">
          {sub.inProgressLessonId ? "Aula em andamento" : "Aula de hoje"}
          {showSubject ? ` · ${sub.subjectName}` : ""}
        </p>
        <DemoBadge show={sub.curriculumIsDemo} />
      </div>
      {!sub.curriculumName ? (
        <p className="mt-2 text-sm">
          Falta escolher o nível.{" "}
          <Link href={`/boas-vindas?passo=2&crianca=${st.id}`} className="font-bold text-primary underline-offset-2 hover:underline">
            Escolher agora
          </Link>
        </p>
      ) : sub.inProgressLessonId || planned ? (
        <>
          <p className="mt-1 font-display text-xl font-semibold">{sub.next?.primaryTitle ?? "Continuar de onde parou"}</p>
          {sub.next?.reasons[0] && !sub.inProgressLessonId ? (
            <p className="text-sm text-muted">
              {REASON[sub.next.reasons[0]] ?? "Escolhido pelo planejador"} ·{" "}
              <Link href={`/students/${st.id}/subjects/${sub.subjectId}/next-lesson`} className="font-bold text-primary underline-offset-2 hover:underline">
                por quê?
              </Link>
            </p>
          ) : null}
          {canRun ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={startTodayAction}>
                {hidden("play")}
                <button type="submit" className="btn btn-primary">
                  {sub.inProgressLessonId ? "Continuar com a criança" : "Começar aula"} →
                </button>
              </form>
              <form action={startTodayAction}>
                {hidden("lesson")}
                <button type="submit" className="btn btn-secondary">
                  Visão do adulto
                </button>
              </form>
            </div>
          ) : null}
        </>
      ) : outcome ? (
        <>
          <p className="mt-1 font-display text-xl font-semibold">{outcome.title}</p>
          <p className="text-sm text-muted">{outcome.text}</p>
          <Link href={`/students/${st.id}/subjects/${sub.subjectId}/next-lesson`} className="btn btn-secondary btn-sm mt-3">
            Ver detalhes
          </Link>
        </>
      ) : null}
    </div>
  );
}
