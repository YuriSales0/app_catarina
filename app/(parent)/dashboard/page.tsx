import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { getDashboard } from "@/lib/dashboard/service";
import { PageHeader, DemoBadge, EmptyState, StatusBadge, formatDateTime } from "@/components/ui";
import { Recommendations } from "@/components/parent/recommendations";
import { roleAllows } from "@/lib/authorization/permissions";
import type { GuardianRole } from "@/lib/db/enums";

export default async function DashboardPage() {
  const actor = await requireActor();
  const cards = await getDashboard(actor);
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Evidence first. Every status links to the attempts behind it, and every next lesson says why it was chosen." />
      {cards.length === 0 ? (
        <EmptyState title="Welcome">
          <Link href="/students/new" className="btn btn-primary mt-2">
            Add your first student
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {cards.map((st) => (
            <section key={st.id} aria-labelledby={`student-${st.id}`} className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`student-${st.id}`} className="text-xl font-semibold">
                  <Link href={`/students/${st.id}`} className="hover:underline">
                    {st.name}
                  </Link>{" "}
                  <span className="text-sm font-normal text-muted">{st.age !== null ? `age ${st.age}` : ""}</span> <DemoBadge show={st.isDemo} />
                </h2>
                <Link href={`/students/${st.id}/snapshots`} className="text-sm underline">
                  Snapshots
                </Link>
              </div>
              {st.subjects.length === 0 ? (
                <p className="text-sm text-muted">
                  Not enrolled in any subject.{" "}
                  <Link href={`/students/${st.id}`} className="underline">
                    Enrol.
                  </Link>
                </p>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                {st.subjects.map((sub) => (
                  <article key={sub.subjectId} className="card space-y-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-semibold">
                        <Link href={`/students/${st.id}/subjects/${sub.subjectId}`} className="hover:underline">
                          {sub.subjectName}
                        </Link>
                      </h3>
                      <span className="text-xs text-muted">
                        {sub.curriculumName ? `${sub.curriculumName} v${sub.curriculumVersion}` : "no curriculum"} <DemoBadge show={sub.curriculumIsDemo} />
                      </span>
                    </div>
                    {sub.summary ? (
                      <p className="text-xs text-muted">
                        {sub.summary.MASTERED} mastered · {sub.summary.PROFICIENT} proficient · {sub.summary.DEVELOPING} developing · {sub.summary.PRACTISING + sub.summary.INTRODUCED} in progress · {sub.summary.NOT_STARTED} to come
                        {sub.summary.dueForReview ? ` · ${sub.summary.dueForReview} due for review` : ""}
                      </p>
                    ) : null}
                    {sub.currentObjectives.length ? (
                      <div>
                        <h4 className="text-xs font-medium uppercase text-muted">Current objectives</h4>
                        <ul className="mt-1 space-y-1 text-sm">
                          {sub.currentObjectives.map((o) => (
                            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                              <Link href={`/students/${st.id}/subjects/${sub.subjectId}/objectives/${o.id}`} className="hover:underline">
                                {o.title}
                              </Link>
                              <span className="flex items-center gap-2 text-xs text-muted">
                                {o.recentTotal ? `${o.recentCorrect}/${o.recentTotal} recent` : `${o.attempts} attempts`} <StatusBadge status={o.status} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">Nothing in progress yet.</p>
                    )}
                    {sub.recurringDifficulties.length ? (
                      <p className="text-sm">
                        <span className="text-xs font-medium uppercase text-muted">Recurring difficulty</span>{" "}
                        {sub.recurringDifficulties.map((d) => `${d.label} (${d.occurrences}×)`).join(", ")}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                      <span>
                        {sub.inProgressLessonId ? (
                          <Link href={`/lessons/${sub.inProgressLessonId}`} className="btn btn-primary px-3 py-1">
                            Continue lesson
                          </Link>
                        ) : sub.next?.outcome === "PLANNED" ? (
                          <>
                            Next: <strong>{sub.next.primaryTitle}</strong>{" "}
                            <Link href={`/students/${st.id}/subjects/${sub.subjectId}/next-lesson`} className="underline">
                              why
                            </Link>
                          </>
                        ) : sub.next ? (
                          <span className="text-muted">{sub.next.outcome.toLowerCase().replace(/_/g, " ")}</span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted">
                        {sub.lastLesson ? (
                          <Link href={`/lessons/${sub.lastLesson.id}/report`} className="hover:underline">
                            Last: lesson {sub.lastLesson.number}, {formatDateTime(sub.lastLesson.completedAt)}
                          </Link>
                        ) : (
                          "No lessons yet"
                        )}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
              {st.recommendations.length ? (
                <div className="card">
                  <h3 className="mb-2 text-sm font-semibold">Recommended actions</h3>
                  <Recommendations studentId={st.id} items={st.recommendations} canDecide={roleAllows(st.role as GuardianRole, "RUN_LESSON")} />
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
