import { and, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { ConflictError } from "@/lib/authorization/errors";
import type { ValidatedCurriculum } from "./validate";
import { createHash } from "node:crypto";

export type ImportOptions = {
  /** Owner of a private/shared curriculum. Null for system-owned (catalogue) curricula. */
  ownerUserId: string | null;
  publish: boolean;
  /** Overrides the file's is_demo flag when set. */
  isDemo?: boolean;
  provenance?: Record<string, unknown>;
  rawText?: string;
};

export type ImportResult = {
  curriculumId: string;
  curriculumVersionId: string;
  subjectId: string;
  version: string;
  status: "DRAFT" | "PUBLISHED";
  units: number;
  objectives: number;
  prerequisites: number;
  lineage: { carriedUnits: number; newUnits: number; carriedObjectives: number; newObjectives: number };
  warnings: string[];
};

/**
 * Inserts a validated curriculum as a new version. Stable lineage ids are
 * carried forward from the curriculum's most recent previous version by
 * unit_key and objective_key (decision D8), so a child's history follows the
 * objective across versions.
 */
export async function importValidatedCurriculum(
  dbh: DbOrTx,
  validated: ValidatedCurriculum,
  options: ImportOptions,
): Promise<ImportResult> {
  const { file, units, objectives } = validated;
  const isDemo = options.isDemo ?? file.is_demo;

  // Subject: shared by slug. Created on first use.
  let subject = await dbh.query.subjects.findFirst({ where: eq(s.subjects.slug, file.subject) });
  if (!subject) {
    [subject] = await dbh
      .insert(s.subjects)
      .values({ slug: file.subject, name: file.subject_name ?? file.subject, isDemo })
      .returning();
  }

  // Skills: subject-scoped by slug.
  const skillIdByKey = new Map<string, string>();
  for (const sk of file.skills) {
    let row = await dbh.query.skills.findFirst({ where: and(eq(s.skills.subjectId, subject.id), eq(s.skills.slug, sk.key)) });
    if (!row) {
      [row] = await dbh
        .insert(s.skills)
        .values({ subjectId: subject.id, slug: sk.key, name: sk.name, description: sk.description, isDemo })
        .returning();
    }
    skillIdByKey.set(sk.key, row.id);
  }

  // Curriculum: subject + slug. Ownership must match on re-import.
  let curriculum = await dbh.query.curricula.findFirst({
    where: and(eq(s.curricula.subjectId, subject.id), eq(s.curricula.slug, file.slug)),
  });
  if (curriculum) {
    if ((curriculum.ownerUserId ?? null) !== options.ownerUserId) {
      throw new ConflictError(`curriculum ${file.slug} for ${file.subject} is owned by someone else`);
    }
    await dbh
      .update(s.curricula)
      .set({ name: file.name, description: file.description, source: file.source, sourceUrl: file.source_url ?? null, visibility: file.visibility })
      .where(eq(s.curricula.id, curriculum.id));
  } else {
    [curriculum] = await dbh
      .insert(s.curricula)
      .values({
        subjectId: subject.id,
        slug: file.slug,
        name: file.name,
        description: file.description,
        source: file.source,
        sourceUrl: file.source_url ?? null,
        ownerUserId: options.ownerUserId,
        visibility: file.visibility,
        isDemo,
      })
      .returning();
  }

  const existingVersion = await dbh.query.curriculumVersions.findFirst({
    where: and(eq(s.curriculumVersions.curriculumId, curriculum.id), eq(s.curriculumVersions.version, file.version)),
  });
  if (existingVersion) throw new ConflictError(`version ${file.version} of ${file.slug} already exists`);

  // Lineage from the most recent previous version.
  const previous = await dbh.query.curriculumVersions.findFirst({
    where: eq(s.curriculumVersions.curriculumId, curriculum.id),
    orderBy: desc(s.curriculumVersions.createdAt),
  });
  const unitLineage = new Map<string, string>();
  const objectiveLineage = new Map<string, string>();
  if (previous) {
    const prevUnits = await dbh.query.curriculumUnits.findMany({ where: eq(s.curriculumUnits.curriculumVersionId, previous.id) });
    for (const u of prevUnits) unitLineage.set(u.unitKey, u.lineageId);
    const prevObjs = await dbh.query.learningObjectives.findMany({ where: eq(s.learningObjectives.curriculumVersionId, previous.id) });
    for (const o of prevObjs) objectiveLineage.set(o.objectiveKey, o.lineageId);
  }

  const fileHash = options.rawText ? createHash("sha256").update(options.rawText).digest("hex") : undefined;
  const [version] = await dbh
    .insert(s.curriculumVersions)
    .values({
      curriculumId: curriculum.id,
      version: file.version,
      status: "DRAFT",
      instructionLanguage: file.instruction_language,
      targetLanguage: file.target_language ?? null,
      errorTagVocabulary: file.error_tags,
      provenance: { ...file.provenance, ...(options.provenance ?? {}), ...(fileHash ? { fileHash } : {}) },
      notes: file.notes,
    })
    .returning();

  // Units, parents first (flatten order guarantees it).
  const unitIdByKey = new Map<string, string>();
  let carriedUnits = 0;
  const siblingSeq = new Map<string | null, number>();
  for (const u of units) {
    const seq = (siblingSeq.get(u.parentKey) ?? 0) + 1;
    siblingSeq.set(u.parentKey, seq);
    const lineageId = unitLineage.get(u.key) ?? newId();
    if (unitLineage.has(u.key)) carriedUnits++;
    const [row] = await dbh
      .insert(s.curriculumUnits)
      .values({
        curriculumVersionId: version.id,
        parentUnitId: u.parentKey ? unitIdByKey.get(u.parentKey)! : null,
        unitKey: u.key,
        lineageId,
        name: u.name,
        description: u.description,
        sequence: seq,
      })
      .returning();
    unitIdByKey.set(u.key, row.id);
  }

  const objectiveIdByKey = new Map<string, string>();
  let carriedObjectives = 0;
  for (const o of objectives) {
    const lineageId = objectiveLineage.get(o.key) ?? newId();
    if (objectiveLineage.has(o.key)) carriedObjectives++;
    const [row] = await dbh
      .insert(s.learningObjectives)
      .values({
        curriculumVersionId: version.id,
        curriculumUnitId: unitIdByKey.get(o.unitKey)!,
        objectiveKey: o.key,
        lineageId,
        code: o.objective.code ?? o.key,
        title: o.objective.title,
        description: o.objective.description,
        sequence: o.sequence,
        difficulty: o.objective.difficulty,
        estimatedSessions: o.objective.estimated_sessions ?? null,
        errorTags: o.objective.error_tags,
        teachingNotes: o.objective.teaching_notes,
        assessmentPolicy: o.objective.assessment_policy ?? null,
      })
      .returning();
    objectiveIdByKey.set(o.key, row.id);
    if (o.objective.skills.length) {
      await dbh.insert(s.objectiveSkills).values(o.objective.skills.map((k) => ({ objectiveId: row.id, skillId: skillIdByKey.get(k)! })));
    }
  }

  let prerequisites = 0;
  for (const o of objectives) {
    if (!o.prerequisites.length) continue;
    await dbh.insert(s.objectivePrerequisites).values(
      o.prerequisites.map((p) => ({
        objectiveId: objectiveIdByKey.get(o.key)!,
        prerequisiteObjectiveId: objectiveIdByKey.get(p.key)!,
        requiredStatus: p.requiredStatus,
        strength: p.strength,
      })),
    );
    prerequisites += o.prerequisites.length;
  }

  let status: "DRAFT" | "PUBLISHED" = "DRAFT";
  if (options.publish) {
    await dbh
      .update(s.curriculumVersions)
      .set({ status: "PUBLISHED", publishedAt: new Date(), publishedByUserId: options.ownerUserId })
      .where(eq(s.curriculumVersions.id, version.id));
    status = "PUBLISHED";
  }

  return {
    curriculumId: curriculum.id,
    curriculumVersionId: version.id,
    subjectId: subject.id,
    version: file.version,
    status,
    units: units.length,
    objectives: objectives.length,
    prerequisites,
    lineage: {
      carriedUnits,
      newUnits: units.length - carriedUnits,
      carriedObjectives,
      newObjectives: objectives.length - carriedObjectives,
    },
    warnings: validated.warnings,
  };
}
