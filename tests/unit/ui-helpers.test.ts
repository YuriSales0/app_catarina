import { describe, it, expect } from "vitest";
import { proposalFromPayload } from "@/lib/lessons/proposal-payload";
import { lastSevenDays } from "@/lib/dashboard/service";
import { describeLevel, suggestedLevelKey } from "@/lib/curriculum/levels";
import { avatarOf } from "@/lib/students/avatar";

const proposal = {
  activity_ref: 2,
  objective_ref: "obj_1",
  title: "Olá",
  child_facing_intro: "Vamos!",
  items: [{ prompt: "Como se diz olá?", expected_response: "hello", accept_also: ["hi"], skill_ref: null, checkable: "SET" as const }],
  needs_clarification: null,
};

describe("proposalFromPayload", () => {
  it("reads the stored ActivityContent shape ({ proposal, packId })", () => {
    expect(proposalFromPayload({ kind: "activity", pack_id: "pk_old", proposal: { proposal, packId: "pk_1" } })).toEqual({ proposal, packId: "pk_1" });
  });
  it("reads a bare proposal, taking the pack id from the payload", () => {
    expect(proposalFromPayload({ kind: "activity", pack_id: "pk_2", proposal })).toEqual({ proposal, packId: "pk_2" });
  });
  it("returns null for rejected or malformed payloads", () => {
    expect(proposalFromPayload({ kind: "activity", error: { kind: "TIMEOUT" } })).toBeNull();
    expect(proposalFromPayload({ proposal: { title: "no items" } })).toBeNull();
    expect(proposalFromPayload(null)).toBeNull();
  });
});

describe("lastSevenDays", () => {
  const now = new Date("2026-09-24T15:00:00Z");
  it("returns seven days ending today in the student's timezone, marking lesson days", () => {
    const week = lastSevenDays(now, "America/Sao_Paulo", [new Date("2026-09-24T02:00:00Z"), new Date("2026-09-20T18:00:00Z")]);
    expect(week).toHaveLength(7);
    expect(week.at(-1)).toMatchObject({ date: "2026-09-24", today: true, done: false });
    // 02:00Z on the 24th is still the 23rd in São Paulo.
    expect(week.find((d) => d.date === "2026-09-23")?.done).toBe(true);
    expect(week.find((d) => d.date === "2026-09-20")?.done).toBe(true);
    expect(week.filter((d) => d.done)).toHaveLength(2);
  });
});

describe("levels and avatars", () => {
  it("recognises the Cambridge levels by curriculum name and suggests one by age", () => {
    expect(describeLevel("English Starters (Cambridge Pre A1 aligned)")).toMatchObject({ key: "starters", cefr: "Pre A1" });
    expect(describeLevel("English Movers (Cambridge A1 aligned)")).toMatchObject({ key: "movers", cefr: "A1" });
    expect(describeLevel("My family English").key).toBe("other");
    expect(suggestedLevelKey(6)).toBe("starters");
    expect(suggestedLevelKey(9)).toBe("movers");
    expect(suggestedLevelKey(null)).toBe("starters");
  });
  it("uses the stored avatar and falls back to a stable default for unknown values", () => {
    expect(avatarOf({ name: "Ana", metadata: { avatar: { animal: "panda", color: "mint" } } })).toEqual({ animal: "panda", color: "mint" });
    const a = avatarOf({ name: "Ana", metadata: { avatar: { animal: "dragon", color: "black" } } });
    expect(a).toEqual(avatarOf({ name: "Ana", metadata: {} }));
  });
});
