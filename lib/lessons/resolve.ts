import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { lessons } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/authorization/errors";

/**
 * A lesson URL carries no student id. The student is resolved server-side and
 * access is then checked against it; the lesson id alone grants nothing.
 */
export async function resolveLessonStudent(lessonId: string): Promise<string> {
  const row = await db().query.lessons.findFirst({ where: eq(lessons.id, lessonId), columns: { studentId: true } });
  if (!row) throw new NotFoundError();
  return row.studentId;
}
