import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { StudentAccess } from "@/lib/authorization/access";
import { NotFoundError, ValidationError } from "@/lib/authorization/errors";
import { roleAllows } from "@/lib/authorization/permissions";
import { writeAudit } from "@/lib/audit/write";

/** RECOMMENDED records: proposals with an outcome. Status is the only mutable field. */
export async function listRecommendations(access: StudentAccess, opts: { subjectId?: string; status?: s.LearningRecommendationRow["status"]; limit?: number } = {}, dbh: DbOrTx = db()) {
  return dbh
    .select({
      id: s.learningRecommendation.id,
      kind: s.learningRecommendation.kind,
      statement: s.learningRecommendation.statement,
      rationale: s.learningRecommendation.rationale,
      source: s.learningRecommendation.source,
      status: s.learningRecommendation.status,
      objectiveId: s.learningRecommendation.objectiveId,
      objectiveTitle: s.learningObjectives.title,
      subjectId: s.learningRecommendation.subjectId,
      subjectName: s.subjects.name,
      lessonId: s.learningRecommendation.lessonId,
      createdAt: s.learningRecommendation.createdAt,
      decidedAt: s.learningRecommendation.decidedAt,
    })
    .from(s.learningRecommendation)
    .innerJoin(s.subjects, eq(s.subjects.id, s.learningRecommendation.subjectId))
    .leftJoin(s.learningObjectives, eq(s.learningObjectives.id, s.learningRecommendation.objectiveId))
    .where(
      and(
        eq(s.learningRecommendation.studentId, access.studentId),
        opts.subjectId ? eq(s.learningRecommendation.subjectId, opts.subjectId) : undefined,
        opts.status ? eq(s.learningRecommendation.status, opts.status) : undefined,
      ),
    )
    .orderBy(desc(s.learningRecommendation.createdAt))
    .limit(opts.limit ?? 20);
}

export async function decideRecommendation(access: StudentAccess, recommendationId: string, decision: "ACCEPTED" | "REJECTED", dbh: DbOrTx = db()) {
  if (!roleAllows(access.role, "RUN_LESSON")) throw new NotFoundError();
  return dbh.transaction(async (tx) => {
    const row = await tx.query.learningRecommendation.findFirst({ where: and(eq(s.learningRecommendation.id, recommendationId), eq(s.learningRecommendation.studentId, access.studentId)) });
    if (!row) throw new NotFoundError();
    if (row.status !== "PROPOSED") throw new ValidationError("This recommendation has already been decided.");
    await tx.update(s.learningRecommendation).set({ status: decision, decidedByUserId: access.userId, decidedAt: new Date() }).where(eq(s.learningRecommendation.id, row.id));
    await writeAudit(tx, {
      actorUserId: access.userId,
      actorType: "USER",
      action: `recommendation.${decision.toLowerCase()}`,
      resourceType: "learning_recommendation",
      resourceId: row.id,
      studentId: access.studentId,
      result: "ALLOWED",
      requestId: access.requestId,
    });
  });
}
