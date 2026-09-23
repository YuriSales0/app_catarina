"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { decideRecommendation } from "@/lib/recommendations/service";

export async function decideRecommendationAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const studentId = z.string().uuid().parse(formData.get("studentId"));
  const recommendationId = z.string().uuid().parse(formData.get("recommendationId"));
  const decision = z.enum(["ACCEPTED", "REJECTED"]).parse(formData.get("decision"));
  const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
  await decideRecommendation(access, recommendationId, decision);
  revalidatePath("/dashboard");
  revalidatePath(`/students/${studentId}`);
}
