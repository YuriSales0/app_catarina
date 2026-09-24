import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { listAccessibleStudents, requireStudentAccess } from "@/lib/authorization/access";
import { listEnrolments } from "@/lib/students/service";
import { roleAllows } from "@/lib/authorization/permissions";
import { Avatar, avatarOf } from "@/components/brand/avatar";
import { LumiSays } from "@/components/brand/lumi";
import { startTodayAction } from "@/app/(parent)/lessons/today-actions";

export const metadata = { title: "Modo criança" };

/** "Who is learning today?" The child taps their own avatar and lands in today's lesson. */
export default async function KidsPage() {
  const actor = await requireActor();
  const students = (await listAccessibleStudents(actor)).filter((s) => roleAllows(s.role, "RUN_LESSON"));
  const kids = await Promise.all(
    students.map(async (st) => {
      const access = await requireStudentAccess(actor, st.id, "VIEW");
      const enrolment = (await listEnrolments(access)).find((e) => e.active && e.curriculumVersionId) ?? null;
      return { st, enrolment };
    }),
  );

  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col">
      <div className="flex justify-end">
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          Sair do modo criança
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center py-8">
        <LumiSays mood="cheer" size={96}>
          <span className="font-display text-2xl font-semibold">Quem vai estudar hoje?</span>
        </LumiSays>
        <ul className="mt-10 grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {kids.map(({ st, enrolment }) => (
            <li key={st.id}>
              {enrolment ? (
                <form action={startTodayAction}>
                  <input type="hidden" name="studentId" value={st.id} />
                  <input type="hidden" name="subjectId" value={enrolment.subjectId} />
                  <input type="hidden" name="surface" value="play" />
                  <button type="submit" className="kid-card flex w-full flex-col items-center gap-4 transition hover:-translate-y-1 focus-visible:outline-4 focus-visible:outline-primary/60">
                    <Avatar choice={avatarOf(st)} size="xl" />
                    <span className="font-display text-3xl font-semibold">{st.name}</span>
                    <span className="rounded-full bg-primary px-6 py-2 font-display text-lg font-semibold text-primary-foreground">Vamos lá! →</span>
                  </button>
                </form>
              ) : (
                <div className="kid-card flex flex-col items-center gap-4 opacity-70">
                  <Avatar choice={avatarOf(st)} size="xl" className="grayscale" />
                  <span className="font-display text-3xl font-semibold">{st.name}</span>
                  <span className="text-center text-sm text-muted">Um adulto precisa escolher o nível primeiro.</span>
                </div>
              )}
            </li>
          ))}
        </ul>
        {kids.length === 0 ? (
          <Link href="/boas-vindas" className="btn btn-primary btn-lg mt-8">
            Cadastrar uma criança
          </Link>
        ) : null}
      </div>
    </main>
  );
}
