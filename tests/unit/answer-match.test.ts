import { describe, it, expect } from "vitest";
import { matchAnswer, normalizeAnswer } from "@/lib/assessment/answer-match";

describe("matchAnswer", () => {
  it("matches exactly after normalisation, including number words and digits", () => {
    expect(matchAnswer(" Three! ", ["three"])).toEqual({ match: true, method: "exact" });
    expect(matchAnswer("3", ["three"]).match).toBe(true);
    expect(matchAnswer("Good-bye.", ["goodbye", "good bye"]).match).toBe(true);
    expect(normalizeAnswer("Olá, I'm SEVEN")).toEqual(["ola", "i", "m", "7"]);
  });
  it("accepts the answer inside a short spoken phrase", () => {
    expect(matchAnswer("a cat", ["cat"])).toEqual({ match: true, method: "phrase" });
    expect(matchAnswer("it's a cat", ["cat"]).match).toBe(true);
    expect(matchAnswer("hello teacher", ["hello"]).match).toBe(true);
  });
  it("refuses negations, long answers and near misses", () => {
    expect(matchAnswer("it's not a cat", ["cat"]).match).toBe(false);
    expect(matchAnswer("I don't know cat", ["cat"]).match).toBe(false);
    expect(matchAnswer("I think maybe it could be a cat", ["cat"]).match).toBe(false);
    expect(matchAnswer("cats", ["cat"]).match).toBe(false);
    expect(matchAnswer("dog", ["cat"]).match).toBe(false);
    expect(matchAnswer("", ["cat"]).match).toBe(false);
  });
  it("keeps a negation when the accepted answer has one", () => {
    expect(matchAnswer("I don't have a dog", ["I don't have a dog"]).match).toBe(true);
    expect(matchAnswer("no I don't have a dog", ["I don't have a dog"]).match).toBe(true);
  });
});
