import { v7 as uuidv7 } from "uuid";

/** Time-ordered UUIDs, generated in the application so a write knows its id. */
export function newId(): string {
  return uuidv7();
}
