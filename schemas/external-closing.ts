import { z } from "zod";
import { EVIDENCE_RESULTS } from "@/lib/db/enums";

/**
 * The closing block an external assistant (the family's own ChatGPT) writes
 * at the end of a lesson it ran, pasted back by the parent. Lenient on shape
 * (unknown fields are dropped, optional lists default to empty), strict on
 * bounds, and never trusted as observed fact: see lib/lessons/external.ts.
 */
export const EXTERNAL_CLOSING_FORMAT = "learning-os-closing.v1" as const;

const text = (max: number) => z.string().trim().max(max);

export const externalClosingSchema = z.object({
  format: z.string().optional(),
  lesson_code: z.string().trim().min(4).max(20),
  minutes: z.coerce.number().int().min(1).max(180).nullable().optional(),
  activities: z
    .array(
      z.object({
        activity: z.coerce.number().int().min(1).max(20),
        attempts: z
          .array(
            z.object({
              prompt: text(300).min(1),
              expected: text(300).nullable().optional(),
              child_said: text(500).nullable().optional(),
              result: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v), z.enum(EVIDENCE_RESULTS)),
            }),
          )
          .max(15)
          .default([]),
      }),
    )
    .max(12),
  summary: text(1500).default(""),
  went_well: z.array(text(300)).max(5).default([]),
  was_hard: z.array(text(300)).max(5).default([]),
  next_time: text(500).nullable().optional(),
});
export type ExternalClosing = z.infer<typeof externalClosingSchema>;

/**
 * Finds the JSON in what the parent pasted: a fenced block, or the outermost
 * braces, with typographic quotes straightened if a chat app curled them.
 */
export function extractClosingJson(pasted: string): unknown {
  const fenced = pasted.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? pasted;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object found");
  const raw = source.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(raw.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"));
  }
}
