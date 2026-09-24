import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Architectural invariants as tests: the AI module has no path to the database
 * or the learning engine, and the learning engine has no path to the AI module.
 */
function walk(dir: string, acc: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(f)) acc.push(p);
  }
  return acc;
}
const imports = (file: string) => [...readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);

describe("module boundaries", () => {
  it("lib/ai imports neither the database nor the learning or lessons modules", () => {
    for (const f of walk("lib/ai")) {
      for (const i of imports(f)) {
        expect(i, `${f} imports ${i}`).not.toMatch(/^@\/lib\/(db|learning|lessons|authorization|students|curriculum|snapshots|context)/);
        expect(i, `${f} imports ${i}`).not.toMatch(/drizzle-orm|^pg$/);
      }
    }
  });
  it("the learning engine imports nothing from lib/ai; the only consumers of AI output are the proposal and live-voice seams", () => {
    const seams = ["lib/lessons/ai-proposals.ts", "lib/lessons/voice.ts"];
    for (const f of walk("lib/learning").concat(walk("lib/lessons"), walk("lib/context"))) {
      if (seams.includes(f)) continue;
      for (const i of imports(f)) expect(i, `${f} imports ${i}`).not.toMatch(/^@\/lib\/ai/);
    }
    for (const seam of seams) for (const i of imports(seam)) expect(i, `${seam} imports ${i}`).not.toMatch(/^@\/lib\/ai\/(openai|index)|^@\/lib\/ai$/);
  });
  it("components never import the database or env", () => {
    for (const f of walk("components")) {
      for (const i of imports(f)) expect(i, `${f} imports ${i}`).not.toMatch(/^@\/lib\/(db\/(?!enums)|db"|env)/);
    }
  });
});
