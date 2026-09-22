import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { listCurriculaForActor } from "@/lib/curriculum/service";
import { PageHeader, DemoBadge, EmptyState } from "@/components/ui";

export default async function CurriculaPage() {
  const actor = await requireActor();
  const curricula = await listCurriculaForActor(actor);
  return (
    <>
      <PageHeader
        title="Curricula"
        subtitle="What may be learned, and in what order. Published versions are frozen; changes become a new version."
        actions={
          <Link href="/curricula/new" className="btn btn-primary">
            Import a curriculum
          </Link>
        }
      />
      {curricula.length === 0 ? (
        <EmptyState title="No curricula available">Import one from a YAML file to get started.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {curricula.map((c) => (
            <li key={c.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {c.name} <DemoBadge show={c.isDemo} />
                  </p>
                  <p className="text-sm text-muted">
                    {c.subjectName} · {c.source.toLowerCase().replace("_", " ")} · {c.visibility.toLowerCase()}
                    {c.ownerUserId === actor.userId ? " · yours" : ""}
                  </p>
                </div>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {c.versions.map((v) => (
                    <li key={v.id}>
                      <Link href={`/curricula/${v.id}`} className={`badge hover:underline ${v.status === "PUBLISHED" ? "border-success/50" : ""}`}>
                        v{v.version} · {v.status.toLowerCase()}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              {c.description ? <p className="mt-2 text-sm text-muted">{c.description}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
