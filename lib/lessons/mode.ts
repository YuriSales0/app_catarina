import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import { isLiteracySubject } from "@/lib/literacy";

/** A lesson is a literacy lesson when its subject is the literacy subject. */
export async function isLiteracySubjectId(subjectId: string, dbh: DbOrTx = db()): Promise<boolean> {
  const row = await dbh.query.subjects.findFirst({ where: eq(s.subjects.id, subjectId), columns: { slug: true } });
  return isLiteracySubject(row?.slug);
}
