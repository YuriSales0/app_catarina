import { decideRecommendationAction } from "@/app/(parent)/dashboard/actions";
import type { listRecommendations } from "@/lib/recommendations/service";

type Rec = Awaited<ReturnType<typeof listRecommendations>>[number];

/** Proposals with an outcome. Accepting one changes nothing in the learning state; it records the parent's decision. */
export function Recommendations({ studentId, items, canDecide }: { studentId: string; items: Rec[]; canDecide: boolean }) {
  if (items.length === 0) return <p className="text-sm text-muted">No open recommendations.</p>;
  return (
    <ul className="space-y-2">
      {items.map((r) => (
        <li key={r.id} className="rounded-md border border-border p-3 text-sm">
          <p>
            <span className="badge mr-1">{r.kind.toLowerCase().replace("_", " ")}</span>
            {r.objectiveTitle ? <strong>{r.objectiveTitle}: </strong> : null}
            {r.statement}
          </p>
          <p className="mt-1 text-xs text-muted">
            {r.subjectName} · proposed by {r.source.toLowerCase().replace(/_/g, " ")}
            {r.status !== "PROPOSED" ? ` · ${r.status.toLowerCase()}` : ""}
          </p>
          {canDecide && r.status === "PROPOSED" ? (
            <div className="mt-2 flex gap-2">
              {(["ACCEPTED", "REJECTED"] as const).map((d) => (
                <form key={d} action={decideRecommendationAction}>
                  <input type="hidden" name="studentId" value={studentId} />
                  <input type="hidden" name="recommendationId" value={r.id} />
                  <input type="hidden" name="decision" value={d} />
                  <button type="submit" className={`btn px-2 py-1 text-xs ${d === "ACCEPTED" ? "btn-secondary" : "btn-danger"}`}>
                    {d === "ACCEPTED" ? "Accept" : "Dismiss"}
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
