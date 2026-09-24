import { decideRecommendationAction } from "@/app/(parent)/dashboard/actions";
import type { listRecommendations } from "@/lib/recommendations/service";
import { RECOMMENDATION_KIND } from "@/lib/copy/pt";

type Rec = Awaited<ReturnType<typeof listRecommendations>>[number];

const SOURCE: Record<string, string> = { NEXT_LESSON_ENGINE: "planejador", AI_PROVIDER: "IA", HUMAN: "você" };
const DECIDED: Record<string, string> = { ACCEPTED: "aceita", REJECTED: "dispensada", EXPIRED: "expirada" };

/** Proposals with an outcome. Accepting one changes nothing in the learning state; it records the parent's decision. */
export function Recommendations({ studentId, items, canDecide }: { studentId: string; items: Rec[]; canDecide: boolean }) {
  if (items.length === 0) return <p className="text-sm text-muted">Nenhuma sugestão aberta.</p>;
  return (
    <ul className="space-y-2">
      {items.map((r) => (
        <li key={r.id} className="rounded-2xl bg-surface p-3 text-sm">
          <p>
            <span className="badge mr-1.5">{RECOMMENDATION_KIND[r.kind] ?? r.kind}</span>
            {r.objectiveTitle ? <strong>{r.objectiveTitle}: </strong> : null}
            {r.statement}
          </p>
          <p className="mt-1 text-xs text-muted">
            {r.subjectName} · sugerido pelo {SOURCE[r.source] ?? r.source}
            {r.status !== "PROPOSED" ? ` · ${DECIDED[r.status] ?? r.status}` : ""}
          </p>
          {canDecide && r.status === "PROPOSED" ? (
            <div className="mt-2 flex gap-2">
              {(["ACCEPTED", "REJECTED"] as const).map((d) => (
                <form key={d} action={decideRecommendationAction}>
                  <input type="hidden" name="studentId" value={studentId} />
                  <input type="hidden" name="recommendationId" value={r.id} />
                  <input type="hidden" name="decision" value={d} />
                  <button type="submit" className={`btn btn-sm ${d === "ACCEPTED" ? "btn-soft" : "btn-ghost"}`}>
                    {d === "ACCEPTED" ? "Aceitar" : "Dispensar"}
                  </button>
                </form>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
