import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent } from "@/lib/students/service";
import { listSnapshots } from "@/lib/snapshots/generate";
import { PageHeader, EmptyState, formatDateTime, DemoBadge } from "@/components/ui";
import { takeSnapshotAction } from "./actions";
import { roleAllows } from "@/lib/authorization/permissions";

export default async function SnapshotsPage(props: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await props.params;
  const actor = await requireActor();
  const { access, student, snapshots } = await or404(async () => {
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [student, snapshots] = await Promise.all([getStudent(access), listSnapshots(access)]);
    return { access, student, snapshots };
  });
  return (
    <>
      <PageHeader
        title={`${student.name} · Snapshots`}
        crumbs={[{ href: `/students/${student.id}`, label: student.name }]}
        subtitle={
          <>
            The learning state frozen at points in time, so progress can be compared across months. Immutable. <DemoBadge show={student.isDemo} />
          </>
        }
        actions={
          roleAllows(access.role, "RUN_LESSON") ? (
            <form action={takeSnapshotAction}>
              <input type="hidden" name="studentId" value={student.id} />
              <button type="submit" className="btn btn-secondary">
                Take a snapshot now
              </button>
            </form>
          ) : null
        }
      />
      {snapshots.length === 0 ? (
        <EmptyState title="No snapshots yet">One is taken automatically at the end of every lesson.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {snapshots.map((sn) => (
            <li key={sn.id} className="card flex flex-wrap items-center justify-between gap-2 text-sm">
              <Link href={`/snapshots/${sn.id}`} className="font-medium hover:underline">
                Snapshot #{sn.snapshotVersion}
              </Link>
              <span className="text-muted">
                {formatDateTime(sn.createdAt, student.timezone)} · {String((sn.generatedFrom as { trigger?: string }).trigger ?? "").toLowerCase().replace("_", " ")} · {sn.scope.toLowerCase()} · hash {sn.contentHash.slice(0, 12)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
