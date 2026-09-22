import { parse as parseYaml } from "yaml";
import { validateCurriculumObject, type ValidationOutcome } from "./validate";

/** YAML text (a file or a pasted draft) to a validated curriculum, or errors. */
export function parseCurriculumYaml(text: string): ValidationOutcome {
  let doc: unknown;
  try {
    doc = parseYaml(text, { strict: true });
  } catch (err) {
    return { ok: false, errors: [`YAML parse error: ${(err as Error).message}`] };
  }
  if (doc === null || typeof doc !== "object") return { ok: false, errors: ["curriculum must be a YAML mapping"] };
  return validateCurriculumObject(doc);
}
