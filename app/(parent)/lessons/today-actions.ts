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
 * create it. Opens child mode, the adult runner, or the external-ChatGPT page.
 */
export async function startTodayAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const studentId = z.string().uuid().parse(formData.get("studentId"));
  const subjectId = z.string().uuid().parse(formData.get("subjectId"));
  const surface = z.enum(["play", "lesson", "chatgpt"]).catch("play").parse(formData.get("surface"));
  const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
  const recent = await listLessons(access, subjectId, 10);
  const open = recent.find((l) => l.status === "IN_PROGRESS" || l.status === "PLANNED");
  let lessonId = open?.id;
  if (!lessonId) {
    const plan = await getNextLessonPlan(access, subjectId);
    if (plan.outcome !== "PLANNED") redirect(`/students/${studentId}/subjects/${subjectId}/next-lesson`);
    // A double click makes one lesson; once that lesson is cancelled or completed, the key moves on with the lesson count.
    const latest = recent.reduce((n, l) => Math.max(n, l.lessonNumber), 0);
    const kind = plan.placement_test ? "level-check" : "lesson";
    const lesson = await createLessonFromPlan(access, plan, { idempotencyKey: `engine:${plan.curriculum_version_id}:${plan.primary_objective!.id}:${kind}:after-${latest}` });
    lessonId = lesson.id;
  }
  redirect(surface === "play" ? `/play/${lessonId}` : surface === "chatgpt" ? `/lessons/${lessonId}/chatgpt` : `/lessons/${lessonId}`);
}
