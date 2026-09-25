"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { enrolStudentInSubject, getEnrolment } from "@/lib/students/service";
import { listPublishedVersionsForSubject } from "@/lib/curriculum/service";
import { describeLevel, type LevelInfo } from "@/lib/curriculum/levels";
import { setStartingPoint } from "@/lib/lessons/starting-point";

const input = z.object({
  studentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  choice: z.enum(["BEGINNER", "TEST", "CONFIRM_SUGGESTED"]),
  /** Move to another track first: the very beginning is Starters, whatever was chosen before. */
  track: z.enum(["keep", "starters", "movers"]).default("keep"),
  back: z.string().regex(/^\/[a-z0-9/_-]*$/i).optional(),
});

/**
 * "Where does she start?" from the profile, the next-lesson page or a level
 * check's report. Switching track pins the track's published version first
 * (the enrolment service snapshots the state before a version change).
 */
export async function startingPointAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const v = input.parse({
    studentId: formData.get("studentId"),
    subjectId: formData.get("subjectId"),
    choice: formData.get("choice"),
    track: formData.get("track") ?? undefined,
    back: formData.get("back") ?? undefined,
  });
  const access = await requireStudentAccess(actor, v.studentId, "MANAGE_ENROLMENT");
  if (v.track !== "keep") {
    const enrolment = await getEnrolment(access, v.subjectId);
    const target = (await listPublishedVersionsForSubject(actor, v.subjectId)).find((x) => !x.isDemo && describeLevel(x.curriculumName).key === (v.track as LevelInfo["key"]));
    if (target && target.versionId !== enrolment.curriculumVersionId) {
      await enrolStudentInSubject(access, {
        subjectId: v.subjectId,
        curriculumVersionId: target.versionId,
        instructionLanguage: enrolment.instructionLanguage ?? "pt-BR",
        targetLanguage: target.targetLanguage ?? enrolment.targetLanguage ?? undefined,
        targetLevel: describeLevel(target.curriculumName).cefr ?? undefined,
        plannedLessonMinutes: enrolment.plannedLessonMinutes,
      });
    }
  }
  await setStartingPoint(access, v.subjectId, v.choice);
  revalidatePath(`/students/${v.studentId}`);
  redirect(v.back ?? `/students/${v.studentId}/subjects/${v.subjectId}/next-lesson`);
}
