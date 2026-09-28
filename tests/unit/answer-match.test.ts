import { describe, it, expect } from "vitest";
import { acceptedAlternatives, isNonAttempt, matchAnswer, normalizeAnswer, portugueseShare } from "@/lib/assessment/answer-match";
import { gradeExternalAttempt } from "@/lib/lessons/external";

describe("matchAnswer", () => {
  it("matches exactly after normalisation, including number words and digits", () => {
    expect(matchAnswer(" Three! ", ["three"])).toEqual({ match: true, method: "exact", result: "CORRECT" });
    expect(matchAnswer("3", ["three"]).match).toBe(true);
    expect(matchAnswer("Good-bye.", ["goodbye", "good bye"]).match).toBe(true);
    expect(normalizeAnswer("Olá, I'm SEVEN")).toEqual(["ola", "i", "m", "7"]);
  });
  it("accepts the answer inside a short spoken phrase", () => {
    expect(matchAnswer("a cat", ["cat"])).toEqual({ match: true, method: "phrase", result: "CORRECT" });
    expect(matchAnswer("it's a cat", ["cat"]).match).toBe(true);
    expect(matchAnswer("hello teacher", ["hello"]).match).toBe(true);
  });
  it("gives partial credit for a young learner's near miss, never for a different word or number", () => {
    expect(matchAnswer("cats", ["cat"])).toEqual({ match: false, method: "near", result: "PARTIALLY_CORRECT" });
    expect(matchAnswer("Mondei", ["Monday"]).result).toBe("PARTIALLY_CORRECT");
    expect(matchAnswer("it's mondey", ["Monday"]).result).toBe("PARTIALLY_CORRECT");
    expect(matchAnswer("tank you", ["thank you"]).result).toBe("PARTIALLY_CORRECT");
    expect(matchAnswer("Tuesday", ["Monday"]).result).toBe("INCORRECT");
    expect(matchAnswer("dog", ["cat"]).result).toBe("INCORRECT");
    expect(matchAnswer("13", ["30"]).result).toBe("INCORRECT");
    expect(matchAnswer("thirteen", ["thirty"]).result).toBe("INCORRECT");
    expect(matchAnswer("not mondey", ["Monday"]).result).toBe("INCORRECT");
  });
  it("refuses negations, long answers and near misses as full matches", () => {
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
  // Real answers from a lesson run in ChatGPT, which v2 graded as wrong.
  it("accepts each alternative of an answer written with ou, or or a slash", () => {
    expect(matchAnswer("Bye-bye", ["bye ou goodbye"]).result).toBe("CORRECT");
    expect(matchAnswer("goodbye", ["bye or goodbye"]).result).toBe("CORRECT");
    expect(matchAnswer("goodbye", ["bye / goodbye"]).result).toBe("CORRECT");
    expect(acceptedAlternatives(["bye ou goodbye"])).toEqual(["bye ou goodbye", "bye", "goodbye"]);
    // A whole sentence with "or" inside is one answer, not two.
    expect(acceptedAlternatives(["Do you want tea or coffee"])).toEqual(["Do you want tea or coffee"]);
    expect(matchAnswer("coffee", ["Do you want tea or coffee"]).result).toBe("INCORRECT");
  });
  it("accepts a right word inside a Portuguese sentence, but still refuses English hedging and negations", () => {
    expect(matchAnswer("Pode falar hello de volta", ["hello"]).result).toBe("CORRECT");
    expect(matchAnswer("Blue, mas também um pouco misturado com gray", ["blue"]).result).toBe("CORRECT");
    expect(matchAnswer("acho que é blue", ["blue"]).result).toBe("CORRECT");
    expect(matchAnswer("I think maybe it could be a cat", ["cat"]).match).toBe(false);
    expect(matchAnswer("não é blue", ["blue"]).result).toBe("INCORRECT");
    expect(matchAnswer("Marrom", ["brown"]).result).toBe("INCORRECT");
  });
  it("treats 'não sei', 'hum' and 'I don't know' as no attempt, not a wrong answer", () => {
    for (const said of ["Hum", "hmmm", "Não sei", "não sei não", "sei lá", "hum... não lembro", "I don't know"]) {
      expect(isNonAttempt(said)).toBe(true);
      expect(matchAnswer(said, ["hello"])).toEqual({ match: false, method: "no_attempt", result: "NOT_ASSESSED" });
    }
    expect(isNonAttempt("")).toBe(false);
    expect(isNonAttempt("não sei, blue?")).toBe(false);
    expect(matchAnswer("hum... blue", ["blue"]).result).toBe("CORRECT");
  });
  it("ChatGPT's judgement is the base; the system only raises it, except for an English answer given only in Portuguese", () => {
    expect(gradeExternalAttempt("CORRECT", "Helo!", "hello").result).toBe("CORRECT");
    expect(gradeExternalAttempt("INCORRECT", "Pode falar hello de volta", "hello").result).toBe("CORRECT");
    expect(gradeExternalAttempt("INCORRECT", "Hum.", "yellow").result).toBe("NOT_ASSESSED");
    expect(portugueseShare("Marrom.")).toBe(1);
    expect(portugueseShare("It's brown")).toBe(0);
    expect(gradeExternalAttempt("CORRECT", "Marrom.", "brown")).toMatchObject({ result: "PARTIALLY_CORRECT", reason: "external_judgement:CORRECT,portuguese_only" });
    expect(gradeExternalAttempt("CORRECT", "Verde na tela. É como um mercadinho.", "green").result).toBe("PARTIALLY_CORRECT");
    // Portuguese expected (a translation question) or English words in the answer: ChatGPT decides.
    expect(gradeExternalAttempt("CORRECT", "Verde, mais uma que é bem parecida é o cinza, que é gray", "Verde").result).toBe("CORRECT");
    expect(gradeExternalAttempt("CORRECT", "Where were you yesterday", "I was at the park.").result).toBe("CORRECT");
  });
});
