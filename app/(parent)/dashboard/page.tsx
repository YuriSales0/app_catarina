import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { listAccessibleStudents } from "@/lib/authorization/access";
import { PageHeader, DemoBadge, EmptyState } from "@/components/ui";

export default async function DashboardPage() {
  const actor = await requireActor();
  const students = await listAccessibleStudents(actor);
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Evidence first. Every claim on these pages links back to what the child actually did." />
      {students.length === 0 ? (
        <EmptyState title="Welcome">
          <Link href="/students/new" className="btn btn-primary mt-2">
            Add your first student
          </Link>
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {students.map((st) => (
            <li key={st.id} className="card">
              <div className="flex items-center justify-between">
                <Link href={`/students/${st.id}`} className="text-lg font-medium hover:underline">
                  {st.name}
                </Link>
                <DemoBadge show={st.isDemo} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
