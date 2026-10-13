import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import type { StudentAccess } from "@/lib/authorization/access";
import { getStudentProgress, type ObjectiveProgress } from "@/lib/learning/progress";
import type { ObjectiveStatus } from "@/lib/db/enums";

/**
 * The letter album of a literacy enrolment: one sticker per letter objective
 * (keys like LIT.L3.M), grouped by island (unit). A sticker is grey until the
 * letter has been met in a lesson, coloured once it has, and gold only when
 * the system's own state says PROFICIENT or MASTERED. The album shows state;
 * it never sets it.
 */
export type Sticker = { letter: string; title: string; look: "locked" | "collected" | "gold" };
export type Island = { name: string; stickers: Sticker[]; gold: number; objectives: number; secure: number };

const LETTER_KEY = /^LIT\.L\d+\.([A-ZÑ])$/;

export function stickerLook(status: ObjectiveStatus): Sticker["look"] {
  if (status === "PROFICIENT" || status === "MASTERED") return "gold";
  if (status === "NOT_STARTED") return "locked";
  return "collected";
}

/** Pure: islands in curriculum order, each with its letter stickers and how many of its objectives are secure. */
export function letterAlbum(objectives: Array<Pick<ObjectiveProgress, "status"> & { objective: { objectiveKey: string; title: string }; unit: { name: string; sequence: number } }>): Island[] {
  const islands = new Map<number, Island>();
  for (const o of objectives) {
    const island = islands.get(o.unit.sequence) ?? { name: o.unit.name, stickers: [], gold: 0, objectives: 0, secure: 0 };
    island.objectives += 1;
    if (o.status === "PROFICIENT" || o.status === "MASTERED") island.secure += 1;
    const m = LETTER_KEY.exec(o.objective.objectiveKey);
    if (m) {
      const look = stickerLook(o.status);
      island.stickers.push({ letter: m[1], title: o.objective.title, look });
      if (look === "gold") island.gold += 1;
    }
    islands.set(o.unit.sequence, island);
  }
  return [...islands.entries()].sort(([a], [b]) => a - b).map(([, i]) => i);
}

export async function getLetterAlbum(access: StudentAccess, subjectId: string, dbh: DbOrTx = db()): Promise<Island[]> {
  const progress = await getStudentProgress(access, subjectId, dbh);
  return letterAlbum(progress.objectives);
}
