import Link from "next/link";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { resolveLessonStudent } from "@/lib/lessons/resolve";
import { getPlayState, type PlayProposal } from "@/lib/lessons/play";
import { getAIProvider } from "@/lib/ai";
import { hasAiConsent } from "@/lib/lessons/ai-proposals";
import { ACTIVITY, TONE } from "@/lib/copy/pt";
import type { ActivityType, EvidenceResult } from "@/lib/db/enums";
import { Avatar, avatarOf } from "@/components/brand/avatar";
import { Lumi, LumiSays } from "@/components/brand/lumi";
import { AutoPrepare } from "@/components/student/auto-prepare";
import { Confetti } from "@/components/student/confetti";
import { playStartAction, playNextAction, playMarkAction, playFinishAction, playPrepareAction, playAnswerAction } from "./actions";

export const metadata = { title: "Aula" };

/** What Lumi says when an activity starts, per kind of activity. */
const KID_SAYS: Record<ActivityType, string> = {
  REVIEW: "Vamos lembrar o que você já sabe!",
  EXPLANATION: "Olha que legal! Escute e repita comigo.",
  PRACTICE: "Agora é a sua vez! Vamos praticar.",
  GAME: "Hora de brincar em inglês!",
  CONVERSATION: "Vamos bater um papo em inglês!",
  ASSESSMENT: "Mostre tudo o que você sabe! Sem ajuda, combinado?",
  REFLECTION: "O que você aprendeu hoje?",
};

type Evidence = { id: string; prompt: string; result: EvidenceResult; expectedResponse: string | null; occurredAt: Date; attemptNumber: number };

/**
 * The child's screen (section 24 of the brief): one activity at a time, no
 * ids, no scores, no statuses. With AI enabled each activity is prepared by
 * the provider and typed answers with an expected response are graded by the
 * system; otherwise the adult beside the child marks each prompt. Everything
 * goes through the same evidence path as the adult runner.
 */
export default async function PlayPage(props: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await props.params;
  const actor = await requireActor();
  const state = await or404(async () => {
    z.string().uuid().parse(lessonId);
    const studentId = await resolveLessonStudent(lessonId);
    const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
    return getPlayState(access, lessonId);
  });
  const { lesson, student, current, objective, activities, completedCount, attemptsInCurrent, primaryObjective } = state;
  const avatar = avatarOf(student);

  if (lesson.status === "PLANNED") {
    return (
      <main className="flex w-full max-w-xl flex-1 flex-col items-center justify-center text-center">
        <div className="flex items-end gap-2">
          <Avatar choice={avatar} size="xl" className="animate-pop" />
          <Lumi size={110} mood="cheer" className="animate-float" />
        </div>
        <h1 className="mt-6 font-display text-4xl font-semibold">Oi, {student.name}!</h1>
        <p className="mt-2 text-xl">
          Hoje vamos aprender: <strong className="font-display">{primaryObjective.title}</strong>
        </p>
        <form action={playStartAction} className="mt-10 w-full">
          <input type="hidden" name="lessonId" value={lesson.id} />
          <button type="submit" className="kid-btn w-full bg-primary py-7 text-3xl text-primary-foreground shadow-lift hover:bg-primary-strong">
            Começar! 🚀
          </button>
        </form>
        <Link href={`/lessons/${lesson.id}`} className="mt-8 text-sm font-bold text-muted hover:text-foreground">
          Visão do adulto
        </Link>
      </main>
    );
  }

  if (lesson.status === "COMPLETED" || lesson.status === "CANCELLED") {
    const done = lesson.status === "COMPLETED";
    return (
      <main className="flex w-full max-w-xl flex-1 flex-col items-center justify-center text-center">
        {done ? <Confetti /> : null}
        <div className="relative flex items-end gap-2">
          <Avatar choice={avatar} size="xl" className="animate-pop" />
          <Lumi size={120} mood="cheer" className="animate-float" />
        </div>
        <h1 className="relative mt-6 font-display text-4xl font-semibold">{done ? `Parabéns, ${student.name}!` : `Até a próxima, ${student.name}!`}</h1>
        {done ? (
          <>
            <p className="relative mt-3 text-xl">
              Você completou {completedCount} {completedCount === 1 ? "atividade" : "atividades"} hoje!
            </p>
            <p className="relative mt-4 flex flex-wrap justify-center gap-1 text-4xl" aria-hidden>
              {Array.from({ length: Math.max(1, completedCount) }, (_, i) => (
                <span key={i} className="animate-pop" style={{ animationDelay: `${i * 120}ms` }}>
                  ⭐
                </span>
              ))}
            </p>
          </>
        ) : (
          <p className="relative mt-3 text-xl">Essa aula foi encerrada.</p>
        )}
        <div className="relative mt-10 flex flex-col items-center gap-3">
          <Link href="/criancas" className="kid-btn bg-primary text-primary-foreground shadow-lift">
            Voltar ao início
          </Link>
          <Link href={`/lessons/${lesson.id}/report`} className="text-sm font-bold text-muted hover:text-foreground">
            Adulto: ver como foi a aula
          </Link>
        </div>
      </main>
    );
  }

  const [provider, consent] = await Promise.all([getAIProvider(), hasAiConsent(student.id)]);
  const aiMode = provider.id !== "null" && consent && Boolean(current && objective && current.activityType !== "REVIEW");
  const isLast = completedCount + 1 >= activities.length;

  return (
    <main className="flex w-full max-w-2xl flex-1 flex-col">
      <div className="flex items-center justify-between gap-3">
        <Avatar choice={avatar} size="md" />
        <ol className="flex gap-1.5" aria-label={`Atividade ${Math.min(completedCount + 1, activities.length)} de ${activities.length}`}>
          {activities.map((a, i) => (
            <li key={a.id} aria-hidden className={`text-2xl transition ${i < completedCount ? "" : i === completedCount ? "animate-pulse" : "opacity-25 grayscale"}`}>
              ⭐
            </li>
          ))}
        </ol>
        <Link href={`/lessons/${lesson.id}`} className="btn btn-ghost btn-sm" aria-label="Sair para a visão do adulto">
          Adulto
        </Link>
      </div>
      <p className="sr-only">
        {completedCount + 1} de {activities.length}
      </p>

      {!current ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Lumi size={120} mood="cheer" className="animate-float" />
          <h1 className="mt-4 font-display text-4xl font-semibold">Terminamos!</h1>
          <form action={playFinishAction} className="mt-8">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <button type="submit" className="kid-btn bg-primary text-primary-foreground shadow-lift">
              Ver minhas estrelas ⭐
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="mt-8 text-center">
            <div className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-display text-lg font-semibold ${TONE[ACTIVITY[current.activityType].tone].bg} ${TONE[ACTIVITY[current.activityType].tone].ink}`}>
              <span aria-hidden>{ACTIVITY[current.activityType].emoji}</span>
              <h1>{ACTIVITY[current.activityType].kid}</h1>
            </div>
            {objective ? <p className="mt-3 font-display text-3xl font-semibold">{objective.title}</p> : null}
          </div>

          <section className="kid-card mt-6 space-y-6">
            {aiMode && state.proposal ? (
              <AiActivity lessonId={lesson.id} activityId={current.id} objectiveId={objective!.id} type={current.activityType} content={state.proposal} evidence={state.currentEvidence as Evidence[]} />
            ) : aiMode && !state.proposalFailed ? (
              <AutoPrepare action={playPrepareAction} lessonId={lesson.id} />
            ) : (
              <ManualActivity
                lessonId={lesson.id}
                activityId={current.id}
                type={current.activityType}
                objective={objective}
                attempts={attemptsInCurrent}
                note={aiMode && state.proposalFailed ? "A IA não conseguiu preparar esta atividade; usando os exemplos do currículo." : null}
              />
            )}
            <details className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">
              <summary className="cursor-pointer font-bold text-muted">Para o adulto</summary>
              <p className="mt-2">{current.instructions}</p>
            </details>
          </section>

          <div className="mt-8 flex items-center justify-between gap-3 pb-6">
            <form action={playFinishAction}>
              <input type="hidden" name="lessonId" value={lesson.id} />
              <button type="submit" className="btn btn-ghost">
                Parar por aqui
              </button>
            </form>
            <form action={playNextAction}>
              <input type="hidden" name="lessonId" value={lesson.id} />
              <button type="submit" className="kid-btn bg-primary text-primary-foreground shadow-lift hover:bg-primary-strong">
                {isLast ? "Terminar!" : "Próximo →"}
              </button>
            </form>
          </div>
        </>
      )}
    </main>
  );
}

function Feedback({ last }: { last: Evidence | undefined }) {
  if (!last) return null;
  const ok = last.result === "CORRECT";
  const partial = last.result === "PARTIALLY_CORRECT";
  const tone = ok ? "bg-mint text-mint-ink" : partial ? "bg-sun text-sun-ink" : last.result === "NOT_ASSESSED" ? "bg-surface-2 text-muted" : "bg-peach text-peach-ink";
  const text = ok ? "Muito bem! 🎉" : partial ? "Quase! Você está chegando lá." : last.result === "NOT_ASSESSED" ? "Anotado!" : "Quase lá! Vamos continuar.";
  return (
    <div role="status" className={`animate-pop rounded-2xl px-5 py-3 text-center font-display text-xl font-semibold ${tone}`}>
      {text}
      {!ok && last.expectedResponse ? <span className="mt-1 block text-base font-normal">A resposta era: &ldquo;{last.expectedResponse}&rdquo;</span> : null}
    </div>
  );
}

function GrownUpMarks({ lessonId, activityId, objectiveId, type, prompt, expected, editable }: { lessonId: string; activityId: string; objectiveId: string; type: ActivityType; prompt: string; expected?: string | null; editable: boolean }) {
  return (
    <form action={playMarkAction} aria-label="Marcação do adulto" className="rounded-2xl border-2 border-dashed border-border p-4">
      <p className="eyebrow">Adulto: como foi?</p>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="objectiveId" value={objectiveId} />
      <input type="hidden" name="evidenceType" value={type === "ASSESSMENT" ? "ASSESSMENT" : "PRACTICE"} />
      {expected ? <input type="hidden" name="expectedResponse" value={expected} /> : null}
      {editable ? (
        <label className="mt-2 block text-xs text-muted">
          O que foi pedido
          <input name="prompt" className="input mt-1" defaultValue={prompt} required maxLength={2000} />
        </label>
      ) : (
        <input type="hidden" name="prompt" value={prompt} />
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="submit" name="result" value="CORRECT" className="btn bg-mint text-mint-ink hover:brightness-95">
          Acertou
        </button>
        <button type="submit" name="result" value="PARTIALLY_CORRECT" className="btn bg-sun text-sun-ink hover:brightness-95">
          Quase
        </button>
        <button type="submit" name="result" value="INCORRECT" className="btn bg-peach text-peach-ink hover:brightness-95">
          Ainda não
        </button>
      </div>
    </form>
  );
}

function AiActivity({ lessonId, activityId, objectiveId, type, content, evidence }: { lessonId: string; activityId: string; objectiveId: string; type: ActivityType; content: PlayProposal; evidence: Evidence[] }) {
  const { proposal } = content;
  const ordered = [...evidence].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() || a.attemptNumber - b.attemptNumber);
  const answered = new Set(ordered.map((e) => e.prompt));
  const index = proposal.items.findIndex((it) => !answered.has(it.prompt));
  const item = index >= 0 ? proposal.items[index] : null;

  if (type === "EXPLANATION") {
    return (
      <>
        <LumiSays size={80}>{proposal.child_facing_intro}</LumiSays>
        <ul className="grid gap-3 sm:grid-cols-2">
          {proposal.items.map((it, i) => (
            <li key={i} className="rounded-2xl bg-lavender px-5 py-4">
              <p className="font-display text-2xl font-semibold text-lavender-ink">{it.expected_response ?? it.prompt}</p>
              {it.expected_response ? <p className="mt-1 text-sm">{it.prompt}</p> : null}
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      <LumiSays size={80}>{proposal.child_facing_intro}</LumiSays>
      <Feedback last={ordered.at(-1)} />
      {item ? (
        <div key={`item-${index}`} className="space-y-4">
          <p className="text-center text-sm font-bold text-muted">
            Pergunta {index + 1} de {proposal.items.length}
          </p>
          <p className="rounded-3xl bg-sky px-6 py-6 text-center font-display text-3xl leading-snug font-semibold text-sky-ink">{item.prompt}</p>
          {item.checkable !== "OPEN" && item.expected_response ? (
            <form action={playAnswerAction} className="flex flex-col gap-3 sm:flex-row">
              <input type="hidden" name="lessonId" value={lessonId} />
              <input type="hidden" name="item" value={index} />
              <label className="sr-only" htmlFor="answer">
                Sua resposta
              </label>
              <input id="answer" name="answer" required maxLength={300} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="Escreva aqui…" className="input flex-1 rounded-full px-6 py-4 font-display text-2xl" />
              <button type="submit" className="kid-btn bg-primary text-primary-foreground">
                Conferir
              </button>
            </form>
          ) : (
            <GrownUpMarks lessonId={lessonId} activityId={activityId} objectiveId={objectiveId} type={type} prompt={item.prompt} expected={item.expected_response} editable={false} />
          )}
        </div>
      ) : (
        <div className="text-center">
          <p className="font-display text-2xl font-semibold">Atividade completa! 🎉</p>
          <p className="mt-1 text-muted">Toque em &ldquo;Próximo&rdquo; para continuar.</p>
        </div>
      )}
    </>
  );
}

function ManualActivity({
  lessonId,
  activityId,
  type,
  objective,
  attempts,
  note,
}: {
  lessonId: string;
  activityId: string;
  type: ActivityType;
  objective: { id: string; title: string; teachingNotes: unknown } | null;
  attempts: number;
  note: string | null;
}) {
  const notes = (objective?.teachingNotes ?? {}) as Partial<Record<"example_prompts" | "vocabulary" | "structures", string[]>>;
  const prompts = (notes.example_prompts?.length ? notes.example_prompts : (notes.structures ?? [])).slice(0, 6);
  const prompt = prompts.length ? prompts[attempts % prompts.length] : objective ? `${ACTIVITY[type].adult}: ${objective.title}` : "";
  return (
    <>
      <LumiSays size={80}>{KID_SAYS[type]}</LumiSays>
      {note ? <p className="rounded-2xl bg-sun px-4 py-2 text-sm text-sun-ink">{note}</p> : null}
      {type === "EXPLANATION" && prompts.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {prompts.map((p) => (
            <li key={p} className="rounded-2xl bg-lavender px-5 py-4 font-display text-xl font-semibold text-lavender-ink">
              {p}
            </li>
          ))}
        </ul>
      ) : prompt ? (
        <p className="rounded-3xl bg-sky px-6 py-6 text-center font-display text-3xl leading-snug font-semibold text-sky-ink">{prompt}</p>
      ) : null}
      {notes.vocabulary?.length ? (
        <p className="flex flex-wrap justify-center gap-2" aria-label="Palavras">
          {notes.vocabulary.slice(0, 10).map((w) => (
            <span key={w} className="rounded-full bg-surface-2 px-3 py-1 font-display text-lg">
              {w}
            </span>
          ))}
        </p>
      ) : null}
      {objective && type !== "EXPLANATION" ? (
        <>
          <GrownUpMarks lessonId={lessonId} activityId={activityId} objectiveId={objective.id} type={type} prompt={prompt} editable />
          <p className="text-center text-xs text-muted">
            {attempts} {attempts === 1 ? "registrada" : "registradas"} nesta atividade
          </p>
        </>
      ) : null}
    </>
  );
}
