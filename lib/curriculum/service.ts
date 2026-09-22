import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import { NotFoundError, ValidationError } from "@/lib/authorization/errors";
import type { Actor } from "@/lib/auth/session";
import { parseCurriculumYaml } from "./parse";
import { importValidatedCurriculum, type ImportResult } from "./import";
import { writeAudit } from "@/lib/audit/write";

/** Curricula the actor may see: public, or owned by them. */
export async function listCurriculaForActor(actor: Actor, dbh: DbOrTx = db()) {
  const rows = await dbh
    .select({
      id: s.curricula.id,
      slug: s.curricula.slug,
      name: s.curricula.name,
      description: s.curricula.description,
      source: s.curricula.source,
      visibility: s.curricula.visibility,
      ownerUserId: s.curricula.ownerUserId,
      isDemo: s.curricula.isDemo,
      subjectId: s.subjects.id,
      subjectName: s.subjects.name,
      subjectSlug: s.subjects.slug,
    })
    .from(s.curricula)
    .innerJoin(s.subjects, eq(s.subjects.id, s.curricula.subjectId))
    .where(or(eq(s.curricula.visibility, "PUBLIC"), eq(s.curricula.ownerUserId, actor.userId)))
    .orderBy(asc(s.subjects.name), asc(s.curricula.name));

  const ids = rows.map((r) => r.id);
  const versions = ids.length
    ? await dbh.query.curriculumVersions.findMany({
        where: inArray(s.curriculumVersions.curriculumId, ids),
        orderBy: asc(s.curriculumVersions.createdAt),
      })
    : [];
  return rows.map((r) => ({ ...r, versions: versions.filter((v) => v.curriculumId === r.id) }));
}

function curriculumVisibleTo(actor: Actor) {
  return or(eq(s.curricula.visibility, "PUBLIC"), eq(s.curricula.ownerUserId, actor.userId));
}

/** Full detail of one version: units, objectives, prerequisites, skills. */
export async function getCurriculumVersionDetail(actor: Actor, versionId: string, dbh: DbOrTx = db()) {
  const [row] = await dbh
    .select({ version: s.curriculumVersions, curriculum: s.curricula, subject: s.subjects })
    .from(s.curriculumVersions)
    .innerJoin(s.curricula, eq(s.curricula.id, s.curriculumVersions.curriculumId))
    .innerJoin(s.subjects, eq(s.subjects.id, s.curricula.subjectId))
    .where(and(eq(s.curriculumVersions.id, versionId), curriculumVisibleTo(actor)))
    .limit(1);
  if (!row) throw new NotFoundError();

  const units = await dbh.query.curriculumUnits.findMany({
    where: eq(s.curriculumUnits.curriculumVersionId, versionId),
    orderBy: [asc(s.curriculumUnits.sequence)],
  });
  const objectives = await dbh.query.learningObjectives.findMany({
    where: eq(s.learningObjectives.curriculumVersionId, versionId),
    orderBy: [asc(s.learningObjectives.sequence)],
  });
  const objectiveIds = objectives.map((o) => o.id);
  const prerequisites = objectiveIds.length
    ? await dbh.query.objectivePrerequisites.findMany({ where: inArray(s.objectivePrerequisites.objectiveId, objectiveIds) })
    : [];
  const objectiveSkillRows = objectiveIds.length
    ? await dbh
        .select({ objectiveId: s.objectiveSkills.objectiveId, skillId: s.skills.id, skillName: s.skills.name, skillSlug: s.skills.slug })
        .from(s.objectiveSkills)
        .innerJoin(s.skills, eq(s.skills.id, s.objectiveSkills.skillId))
        .where(inArray(s.objectiveSkills.objectiveId, objectiveIds))
    : [];

  return { ...row, units, objectives, prerequisites, objectiveSkills: objectiveSkillRows };
}

/** Published versions of curricula for a subject that the actor may enrol a student in. */
export async function listPublishedVersionsForSubject(actor: Actor, subjectId: string, dbh: DbOrTx = db()) {
  return dbh
    .select({
      versionId: s.curriculumVersions.id,
      version: s.curriculumVersions.version,
      curriculumId: s.curricula.id,
      curriculumName: s.curricula.name,
      source: s.curricula.source,
      isDemo: s.curricula.isDemo,
      instructionLanguage: s.curriculumVersions.instructionLanguage,
      targetLanguage: s.curriculumVersions.targetLanguage,
    })
    .from(s.curriculumVersions)
    .innerJoin(s.curricula, eq(s.curricula.id, s.curriculumVersions.curriculumId))
    .where(and(eq(s.curricula.subjectId, subjectId), eq(s.curriculumVersions.status, "PUBLISHED"), curriculumVisibleTo(actor)))
    .orderBy(asc(s.curricula.name), asc(s.curriculumVersions.version));
}

export type StudioImportInput = { yaml: string; publish: boolean; provenance?: Record<string, unknown> };

/**
 * The Curriculum Studio entry point: YAML text, whatever produced it, goes
 * through validation and the importer. The actor becomes the owner.
 */
export async function importCurriculumForActor(actor: Actor, input: StudioImportInput, dbh: DbOrTx = db()): Promise<ImportResult> {
  const outcome = parseCurriculumYaml(input.yaml);
  if (!outcome.ok) throw new ValidationError("curriculum is invalid", outcome.errors);
  if (outcome.value.file.visibility === "PUBLIC") {
    throw new ValidationError("curriculum is invalid", ["only catalogue curricula may be PUBLIC; use PRIVATE or SHARED"]);
  }
  return dbh.transaction(async (tx) => {
    const result = await importValidatedCurriculum(tx, outcome.value, {
      ownerUserId: actor.userId,
      publish: input.publish,
      isDemo: false,
      provenance: { origin: "studio", ...(input.provenance ?? {}) },
      rawText: input.yaml,
    });
    await writeAudit(tx, {
      actorUserId: actor.userId,
      actorType: "USER",
      action: input.publish ? "curriculum.import_publish" : "curriculum.import_draft",
      resourceType: "curriculum_version",
      resourceId: result.curriculumVersionId,
      result: "ALLOWED",
      requestId: actor.requestId,
    });
    return result;
  });
}

/** Validate only, for the Studio preview. */
export function previewCurriculumYaml(yaml: string) {
  return parseCurriculumYaml(yaml);
}

export async function publishCurriculumVersion(actor: Actor, versionId: string, dbh: DbOrTx = db()) {
  return dbh.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: s.curriculumVersions.id, status: s.curriculumVersions.status, ownerUserId: s.curricula.ownerUserId })
      .from(s.curriculumVersions)
      .innerJoin(s.curricula, eq(s.curricula.id, s.curriculumVersions.curriculumId))
      .where(and(eq(s.curriculumVersions.id, versionId), eq(s.curricula.ownerUserId, actor.userId)))
      .limit(1);
    if (!row) throw new NotFoundError();
    if (row.status !== "DRAFT") throw new ValidationError("only a DRAFT version can be published");
    await tx
      .update(s.curriculumVersions)
      .set({ status: "PUBLISHED", publishedAt: new Date(), publishedByUserId: actor.userId })
      .where(eq(s.curriculumVersions.id, versionId));
    await writeAudit(tx, {
      actorUserId: actor.userId,
      actorType: "USER",
      action: "curriculum.publish",
      resourceType: "curriculum_version",
      resourceId: versionId,
      result: "ALLOWED",
      requestId: actor.requestId,
    });
  });
}

export async function listSubjects(dbh: DbOrTx = db()) {
  return dbh.query.subjects.findMany({ orderBy: asc(s.subjects.name) });
}

export async function getSubjectBySlug(slug: string, dbh: DbOrTx = db()) {
  const row = await dbh.query.subjects.findFirst({ where: eq(s.subjects.slug, slug) });
  if (!row) throw new NotFoundError();
  return row;
}

/** Objectives of a version keyed for quick lookup, used by several services. */
export async function loadVersionGraph(versionId: string, dbh: DbOrTx = db()) {
  const units = await dbh.query.curriculumUnits.findMany({
    where: and(eq(s.curriculumUnits.curriculumVersionId, versionId), isNull(s.curriculumUnits.parentUnitId)),
    orderBy: asc(s.curriculumUnits.sequence),
  });
  const allUnits = await dbh.query.curriculumUnits.findMany({ where: eq(s.curriculumUnits.curriculumVersionId, versionId) });
  const objectives = await dbh.query.learningObjectives.findMany({ where: eq(s.learningObjectives.curriculumVersionId, versionId) });
  const ids = objectives.map((o) => o.id);
  const prerequisites = ids.length
    ? await dbh.query.objectivePrerequisites.findMany({ where: inArray(s.objectivePrerequisites.objectiveId, ids) })
    : [];
  return { topUnits: units, units: allUnits, objectives, prerequisites };
}
