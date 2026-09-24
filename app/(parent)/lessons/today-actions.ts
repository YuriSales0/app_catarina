"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { getNextLessonPlan } from "@/lib/learning/next-lesson";
import { createLessonFromPlan, listLessons } from "@/lib/lessons/service";

/**
 * "Today's lesson" in one click: continue an open lesson if there is one,
 * otherwise ask the engine for the next plan (recomputed server-side) and
 * create it. Opens child mode or the adult runner.
 */
export async function startTodayAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const studentId = z.string().uuid().parse(formData.get("studentId"));
  const subjectId = z.string().uuid().parse(formData.get("subjectId"));
  const surface = z.enum(["play", "lesson"]).catch("play").parse(formData.get("surface"));
  const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
  const open = (await listLessons(access, subjectId, 10)).find((l) => l.status === "IN_PROGRESS" || l.status === "PLANNED");
  let lessonId = open?.id;
  if (!lessonId) {
    const plan = await getNextLessonPlan(access, subjectId);
    if (plan.outcome !== "PLANNED") redirect(`/students/${studentId}/subjects/${subjectId}/next-lesson`);
    const lesson = await createLessonFromPlan(access, plan, { idempotencyKey: `engine:${plan.curriculum_version_id}:${plan.primary_objective!.id}:${plan.generated_at.slice(0, 13)}` });
    lessonId = lesson.id;
  }
  redirect(surface === "play" ? `/play/${lessonId}` : `/lessons/${lessonId}`);
}
