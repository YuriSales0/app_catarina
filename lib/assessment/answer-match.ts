/**
 * System grading of short answers, typed or spoken. Pure and deterministic:
 * no model decides a checkable answer.
 *
 * A match is either exact (after normalisation) or a phrase match: the
 * accepted answer appears as whole words inside a short response ("a cat",
 * "it's a cat" for "cat"). Spoken answers need this; typed answers benefit.
 * A negation the accepted answer does not contain ("not a cat") never
 * matches, and a response much longer than the answer does not either.
 */
export const ANSWER_MATCH_POLICY = { version: "answer-match.v1", maxExtraWords: 3 } as const;

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
};
const NEGATIONS = new Set(["not", "no", "never", "dont", "doesnt", "isnt", "arent", "cant", "wont", "didnt", "nt"]);

export function normalizeAnswer(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/n't\b/g, "nt")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NUMBER_WORDS[w] ?? w);
}

export type AnswerMatch = { match: boolean; method: "exact" | "phrase" | "none" };

export function matchAnswer(response: string, accepted: string[]): AnswerMatch {
  const got = normalizeAnswer(response);
  if (got.length === 0) return { match: false, method: "none" };
  const negated = got.some((w) => NEGATIONS.has(w));
  for (const a of accepted) {
    const want = normalizeAnswer(a);
    if (want.length === 0) continue;
    if (want.join(" ") === got.join(" ")) return { match: true, method: "exact" };
    if (negated && !want.some((w) => NEGATIONS.has(w))) continue;
    if (got.length - want.length > ANSWER_MATCH_POLICY.maxExtraWords) continue;
    for (let i = 0; i + want.length <= got.length; i++) {
      if (want.every((w, j) => got[i + j] === w)) return { match: true, method: "phrase" };
    }
  }
  return { match: false, method: "none" };
}
