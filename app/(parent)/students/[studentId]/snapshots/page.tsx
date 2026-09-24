import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent } from "@/lib/students/service";
import { listSnapshots } from "@/lib/snapshots/generate";
import { PageHeader, EmptyState, formatDateTime, DemoBadge } from "@/components/ui";
import { takeSnapshotAction } from "./actions";
import { roleAllows } from "@/lib/authorization/permissions";

export const metadata = { title: "Retratos" };

const TRIGGER: Record<string, string> = { LESSON_COMPLETED: "fim de aula", MANUAL: "tirado por um adulto", SCHEDULED: "agendado", PRE_MIGRATION: "antes de mudar de nível", EXPORT: "exportação" };

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
        eyebrow="Retratos do progresso"
        title={student.name}
        crumbs={[{ href: "/students", label: "Crianças" }, { href: `/students/${student.id}`, label: student.name }]}
        subtitle={
          <>
            O estado da aprendizagem congelado em cada momento, para comparar a evolução ao longo dos meses. Não muda depois de criado. <DemoBadge show={student.isDemo} />
          </>
        }
        actions={
          roleAllows(access.role, "RUN_LESSON") ? (
            <form action={takeSnapshotAction}>
              <input type="hidden" name="studentId" value={student.id} />
              <button type="submit" className="btn btn-secondary">
                Tirar um retrato agora
              </button>
            </form>
          ) : null
        }
      />
      {snapshots.length === 0 ? (
        <EmptyState title="Nenhum retrato ainda">Um retrato é tirado automaticamente no fim de cada aula.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {snapshots.map((sn) => (
            <li key={sn.id} className="card-flat flex flex-wrap items-center justify-between gap-2 text-sm">
              <Link href={`/snapshots/${sn.id}`} className="font-bold hover:text-primary">
                📸 Retrato #{sn.snapshotVersion}
              </Link>
              <span className="text-muted">
                {formatDateTime(sn.createdAt, student.timezone)} · {TRIGGER[String((sn.generatedFrom as { trigger?: string }).trigger ?? "")] ?? "retrato"} · hash {sn.contentHash.slice(0, 12)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
