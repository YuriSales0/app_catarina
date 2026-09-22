import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { listAccessibleStudents } from "@/lib/authorization/access";
import { PageHeader, DemoBadge, EmptyState, ageYears } from "@/components/ui";

export default async function StudentsPage() {
  const actor = await requireActor();
  const students = await listAccessibleStudents(actor);
  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Children you are a guardian of."
        actions={
          <Link href="/students/new" className="btn btn-primary">
            Add a student
          </Link>
        }
      />
      {students.length === 0 ? (
        <EmptyState title="No students yet">Add a child to start building their learning record.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {students.map((st) => {
            const age = ageYears(st.dateOfBirth);
            return (
              <li key={st.id} className="card">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/students/${st.id}`} className="text-lg font-medium hover:underline">
                    {st.name}
                  </Link>
                  <DemoBadge show={st.isDemo} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {age !== null ? `Age ${age}` : "Age not set"} · your role: {st.role.toLowerCase()}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
