"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { getNextLessonPlan } from "@/lib/learning/next-lesson";
import { createLessonFromPlan } from "@/lib/lessons/service";

/** Recomputes the plan server-side at click time; the client never supplies a plan. */
export async function createFromPlanAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const studentId = z.string().uuid().parse(formData.get("studentId"));
  const subjectId = z.string().uuid().parse(formData.get("subjectId"));
  const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
  const plan = await getNextLessonPlan(access, subjectId);
  if (plan.outcome !== "PLANNED") redirect(`/students/${studentId}/subjects/${subjectId}/next-lesson`);
  const lesson = await createLessonFromPlan(access, plan, { idempotencyKey: `engine:${plan.curriculum_version_id}:${plan.primary_objective!.id}:${plan.generated_at.slice(0, 13)}` });
  redirect(`/lessons/${lesson.id}`);
}
