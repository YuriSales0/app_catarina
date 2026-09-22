import { requireActor } from "@/lib/auth/session";
import { getCurriculumVersionDetail } from "@/lib/curriculum/service";
import { or404 } from "@/lib/actions/page";
import { PageHeader, DemoBadge, DemoNotice, Section, formatDate } from "@/components/ui";
import { publishVersionAction } from "../actions";

export default async function CurriculumVersionPage(props: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await props.params;
  const actor = await requireActor();
  const detail = await or404(() => getCurriculumVersionDetail(actor, versionId));
  const { version, curriculum, subject, units, objectives, prerequisites, objectiveSkills } = detail;
  const objById = new Map(objectives.map((o) => [o.id, o]));
  const prereqsFor = (id: string) => prerequisites.filter((p) => p.objectiveId === id);
  const skillsFor = (id: string) => objectiveSkills.filter((k) => k.objectiveId === id).map((k) => k.skillName);
  const topUnits = units.filter((u) => u.parentUnitId === null);
  const childrenOf = (id: string) => units.filter((u) => u.parentUnitId === id);
  const isOwner = curriculum.ownerUserId === actor.userId;

  const renderUnit = (u: (typeof units)[number], depth: number) => {
    const objs = objectives.filter((o) => o.curriculumUnitId === u.id).sort((a, b) => a.sequence - b.sequence);
    return (
      <section key={u.id} className={depth ? "ml-4 border-l border-border pl-4" : ""}>
        <h3 className="mt-4 font-semibold">
          {u.name} <span className="text-xs font-normal text-muted">{u.unitKey}</span>
        </h3>
        {u.description ? <p className="text-sm text-muted">{u.description}</p> : null}
        <ol className="mt-2 space-y-2">
          {objs.map((o) => {
            const pre = prereqsFor(o.id);
            return (
              <li key={o.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {o.sequence}. {o.title}
                  </span>
                  <span className="text-xs text-muted">
                    {o.code} · difficulty {o.difficulty}
                    {o.estimatedSessions ? ` · ~${o.estimatedSessions} sessions` : ""}
                  </span>
                </div>
                {o.description ? <p className="mt-1 text-muted">{o.description}</p> : null}
                <p className="mt-1 text-xs text-muted">
                  Skills: {skillsFor(o.id).join(", ") || "—"}
                  {pre.length ? (
                    <>
                      {" · Requires: "}
                      {pre
                        .map((p) => `${objById.get(p.prerequisiteObjectiveId)?.code ?? "?"} (${p.requiredStatus.toLowerCase()}${p.strength === "SOFT" ? ", soft" : ""})`)
                        .join(", ")}
                    </>
                  ) : null}
                  {o.errorTags.length ? ` · Watches for: ${o.errorTags.join(", ")}` : ""}
                </p>
              </li>
            );
          })}
        </ol>
        {childrenOf(u.id).map((c) => renderUnit(c, depth + 1))}
      </section>
    );
  };

  return (
    <>
      <PageHeader
        title={`${curriculum.name} v${version.version}`}
        crumbs={[{ href: "/curricula", label: "Curricula" }]}
        subtitle={
          <>
            {subject.name} · {version.status.toLowerCase()}
            {version.publishedAt ? ` since ${formatDate(version.publishedAt)}` : ""} · {curriculum.source.toLowerCase().replace("_", " ")} <DemoBadge show={curriculum.isDemo} />
          </>
        }
        actions={
          isOwner && version.status === "DRAFT" ? (
            <form action={publishVersionAction}>
              <input type="hidden" name="versionId" value={version.id} />
              <button type="submit" className="btn btn-primary">
                Publish this version
              </button>
            </form>
          ) : null
        }
      />
      <DemoNotice show={curriculum.isDemo} />
      {curriculum.description ? <p className="mb-6 text-sm text-muted">{curriculum.description}</p> : null}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="text-lg font-semibold">
            {units.length} units, {objectives.length} objectives, {prerequisites.length} prerequisite links
          </h2>
          {topUnits.map((u) => renderUnit(u, 0))}
        </div>
        <div className="space-y-6">
          <Section title="Provenance">
            <dl className="text-sm">
              {Object.entries(version.provenance).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[auto_1fr] gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="break-all">{String(v)}</dd>
                </div>
              ))}
              {curriculum.sourceUrl ? (
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <dt className="text-muted">source url</dt>
                  <dd className="break-all">{curriculum.sourceUrl}</dd>
                </div>
              ) : null}
            </dl>
          </Section>
          <Section title="Error tag vocabulary">
            <ul className="text-sm">
              {Object.entries(version.errorTagVocabulary).map(([k, v]) => (
                <li key={k}>
                  <span className="font-mono text-xs">{k}</span>: {v}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
