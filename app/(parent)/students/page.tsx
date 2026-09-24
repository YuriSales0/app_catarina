import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { listAccessibleStudents } from "@/lib/authorization/access";
import { PageHeader, DemoBadge, EmptyState, ageYears } from "@/components/ui";
import { Avatar, avatarOf } from "@/components/brand/avatar";
import { ROLE } from "@/lib/copy/pt";

export const metadata = { title: "Crianças" };

export default async function StudentsPage() {
  const actor = await requireActor();
  const students = await listAccessibleStudents(actor);
  return (
    <>
      <PageHeader
        eyebrow="Família"
        title="Crianças"
        subtitle="Quem aprende com você."
        actions={
          <Link href="/boas-vindas" className="btn btn-primary">
            Adicionar criança
          </Link>
        }
      />
      {students.length === 0 ? (
        <EmptyState title="Ninguém por aqui ainda">
          <p>Cadastre uma criança para começar a trilha.</p>
          <Link href="/boas-vindas" className="btn btn-primary mt-4">
            Adicionar criança
          </Link>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((st) => {
            const age = ageYears(st.dateOfBirth);
            return (
              <li key={st.id}>
                <Link href={`/students/${st.id}`} className="card flex items-center gap-4 transition hover:-translate-y-0.5 hover:shadow-lift">
                  <Avatar choice={avatarOf(st)} size="lg" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-display text-xl font-semibold">
                      {st.name} <DemoBadge show={st.isDemo} />
                    </span>
                    <span className="block text-sm text-muted">
                      {age !== null ? `${age} anos` : "Idade não informada"} · {ROLE[st.role]}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
