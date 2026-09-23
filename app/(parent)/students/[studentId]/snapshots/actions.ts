"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { generateSnapshot } from "@/lib/snapshots/generate";

export async function takeSnapshotAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const studentId = z.string().uuid().parse(formData.get("studentId"));
  const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
  const row = await generateSnapshot(access, { scope: "STUDENT", trigger: "MANUAL" });
  revalidatePath(`/students/${studentId}/snapshots`);
  redirect(`/snapshots/${row.id}`);
}
