import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { isNotFound } from "@/lib/authorization/errors";
import { exportStudentData } from "@/lib/students/export";

export async function GET(_req: Request, ctx: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await ctx.params;
  const actor = await requireActor();
  try {
    const access = await requireStudentAccess(actor, studentId, "EXPORT");
    const data = await exportStudentData(access);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="learning-os-student-${studentId}.json"`,
      },
    });
  } catch (err) {
    if (isNotFound(err)) return new Response("Not found", { status: 404 });
    throw err;
  }
}
