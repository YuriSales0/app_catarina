import Link from "next/link";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { resolveLessonStudent } from "@/lib/lessons/resolve";
import { getPlayState } from "@/lib/lessons/play";
import { playStartAction, playNextAction, playMarkAction, playFinishAction } from "./actions";

const FRIENDLY: Record<string, string> = {
  REVIEW: "Let's remember",
  EXPLANATION: "Something new",
  PRACTICE: "Let's practise",
  GAME: "Game time",
  CONVERSATION: "Let's talk",
  ASSESSMENT: "Show what you know",
  REFLECTION: "Think back",
};

/**
 * Screen for the child (section 24 of the brief): START LESSON, one activity
 * at a time, no ids, no scores, no statuses. The adult beside the child taps
 * "Got it" or "Not yet", which is recorded through the same evidence path as
 * everything else.
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
  const { lesson, student, current, objective, activities, completedCount, attemptsInCurrent } = state;
  const notes = (objective?.teachingNotes ?? {}) as Partial<Record<"example_prompts" | "vocabulary" | "structures", string[]>>;
  const prompts = (notes.example_prompts?.length ? notes.example_prompts : notes.structures ?? []).slice(0, 4);

  if (lesson.status === "PLANNED") {
    return (
      <main className="w-full max-w-lg text-center">
        <p className="text-2xl">Hello, {student.name}!</p>
        <form action={playStartAction} className="mt-8">
          <input type="hidden" name="lessonId" value={lesson.id} />
          <button type="submit" className="w-full rounded-2xl bg-primary px-8 py-8 text-3xl font-bold text-primary-foreground shadow-lg focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-primary">
            START LESSON
          </button>
        </form>
        <p className="mt-6 text-sm text-muted">
          <Link href={`/lessons/${lesson.id}`} className="underline">
            Grown-up view
          </Link>
        </p>
      </main>
    );
  }

  if (lesson.status === "COMPLETED" || lesson.status === "CANCELLED") {
    return (
      <main className="w-full max-w-lg text-center">
        <p className="text-4xl">🎉</p>
        <p className="mt-4 text-3xl font-bold">Well done, {student.name}!</p>
        <p className="mt-2 text-lg">That was a good lesson.</p>
        <p className="mt-8 text-sm text-muted">
          <Link href={`/lessons/${lesson.id}/report`} className="underline">
            Grown-ups: see the report
          </Link>
        </p>
      </main>
    );
  }

  if (!current) {
    return (
      <main className="w-full max-w-lg text-center">
        <p className="text-3xl font-bold">All done!</p>
        <form action={playFinishAction} className="mt-8">
          <input type="hidden" name="lessonId" value={lesson.id} />
          <button type="submit" className="w-full rounded-2xl bg-primary px-8 py-6 text-2xl font-bold text-primary-foreground">
            Finish
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="w-full max-w-lg">
      <p className="text-center text-sm text-muted">
        {completedCount + 1} of {activities.length}
      </p>
      <h1 className="mt-2 text-center text-3xl font-bold">{FRIENDLY[current.activityType] ?? current.activityType}</h1>
      {objective ? <p className="mt-2 text-center text-xl">{objective.title}</p> : null}
      <section className="card mt-6 space-y-4 text-lg">
        <p>{current.instructions}</p>
        {prompts.length ? (
          <ul className="space-y-2">
            {prompts.map((p) => (
              <li key={p} className="rounded-xl bg-accent px-4 py-3 text-xl">
                {p}
              </li>
            ))}
          </ul>
        ) : null}
        {notes.vocabulary?.length ? <p className="text-base text-muted">Words: {notes.vocabulary.slice(0, 10).join(" · ")}</p> : null}
      </section>

      {objective && current.activityType !== "EXPLANATION" ? (
        <section aria-label="Grown-up marks" className="mt-6 rounded-xl border border-dashed border-border p-4">
          <p className="text-xs uppercase text-muted">Grown-up: how did that go?</p>
          <form action={playMarkAction} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <input type="hidden" name="activityId" value={current.id} />
            <input type="hidden" name="objectiveId" value={objective.id} />
            <input type="hidden" name="evidenceType" value={current.activityType === "ASSESSMENT" ? "ASSESSMENT" : "PRACTICE"} />
            <input
              name="prompt"
              className="input flex-1 text-base"
              placeholder="What was asked"
              defaultValue={prompts.length ? prompts[attemptsInCurrent % prompts.length] : `${FRIENDLY[current.activityType] ?? current.activityType}: ${objective.title}`}
              required
              maxLength={2000}
            />
            <button type="submit" name="result" value="CORRECT" className="btn btn-primary text-base">
              Got it
            </button>
            <button type="submit" name="result" value="INCORRECT" className="btn btn-secondary text-base">
              Not yet
            </button>
          </form>
          <p className="mt-1 text-xs text-muted">{attemptsInCurrent} recorded in this activity</p>
        </section>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <form action={playFinishAction}>
          <input type="hidden" name="lessonId" value={lesson.id} />
          <button type="submit" className="btn btn-secondary">
            Stop here
          </button>
        </form>
        <form action={playNextAction}>
          <input type="hidden" name="lessonId" value={lesson.id} />
          <button type="submit" className="rounded-2xl bg-primary px-8 py-4 text-2xl font-bold text-primary-foreground">
            {completedCount + 1 === activities.length ? "Finish" : "Next"}
          </button>
        </form>
      </div>
    </main>
  );
}
