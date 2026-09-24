import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { listCurriculaForActor } from "@/lib/curriculum/service";
import { PageHeader, DemoBadge, EmptyState } from "@/components/ui";
import { describeLevel } from "@/lib/curriculum/levels";
import { TONE } from "@/lib/copy/pt";

export const metadata = { title: "Currículos" };

const SOURCE: Record<string, string> = { OFFICIAL: "oficial", SCHOOL: "da escola", FAMILY: "da família", TEACHER: "de professor", TEXTBOOK: "de livro didático", IMPORTED: "importado", AI_GENERATED: "rascunho da IA", MARKETPLACE: "da loja" };
const VISIBILITY: Record<string, string> = { PUBLIC: "público", PRIVATE: "privado", SHARED: "compartilhado" };
const VSTATUS: Record<string, string> = { DRAFT: "rascunho", PUBLISHED: "publicado", ARCHIVED: "arquivado" };

export default async function CurriculaPage() {
  const actor = await requireActor();
  const curricula = await listCurriculaForActor(actor);
  return (
    <>
      <PageHeader
        eyebrow="Biblioteca"
        title="Currículos"
        subtitle="O que pode ser aprendido, e em que ordem. Versões publicadas não mudam; mudanças viram uma nova versão."
        actions={
          <Link href="/curricula/new" className="btn btn-primary">
            Importar currículo
          </Link>
        }
      />
      {curricula.length === 0 ? (
        <EmptyState title="Nenhum currículo disponível">Importe um a partir de um arquivo YAML.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {curricula.map((c) => (
            <li key={c.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${TONE[describeLevel(c.name).tone].bg}`} aria-hidden>
                    {describeLevel(c.name).emoji}
                  </span>
                  <div>
                  <p className="font-display text-lg font-semibold">
                    {c.name} <DemoBadge show={c.isDemo} />
                  </p>
                  <p className="text-sm text-muted">
                    {c.subjectName} · {SOURCE[c.source] ?? c.source.toLowerCase()} · {VISIBILITY[c.visibility] ?? c.visibility.toLowerCase()}
                    {c.ownerUserId === actor.userId ? " · seu" : ""}
                  </p>
                  </div>
                </div>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {c.versions.map((v) => (
                    <li key={v.id}>
                      <Link href={`/curricula/${v.id}`} className={`badge hover:border-primary ${v.status === "PUBLISHED" ? "border-transparent bg-mint text-mint-ink" : ""}`}>
                        v{v.version} · {VSTATUS[v.status] ?? v.status.toLowerCase()}
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
