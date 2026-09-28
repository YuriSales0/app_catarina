/**
 * System grading of short answers, typed or spoken. Pure and deterministic:
 * no model decides a checkable answer.
 *
 * A match is either exact (after normalisation) or a phrase match: the
 * accepted answer appears as whole words inside a short response ("a cat",
 * "it's a cat" for "cat"). Spoken answers need this; typed answers benefit.
 * A negation the accepted answer does not contain ("not a cat") never
 * matches, and a response much longer than the answer does not either.
 *
 * v2: a near miss (one or two letters off, as a young learner's accent or a
 * plural slip comes out in a transcript: "mondei", "cats") is partial credit,
 * not a wrong answer. Numbers are never near: 13 for 30 is a real mistake.
 *
 * v3, from what children really say (their answers come mixed with
 * Portuguese): an accepted answer written with alternatives ("bye ou
 * goodbye", "bye / goodbye") accepts each of them; Portuguese words around
 * the answer ("pode falar hello de volta") do not count as extra words, while
 * English ones still do; a Portuguese negation refuses a match like an
 * English one; and "não sei", "hum" or "I don't know" is no attempt at all,
 * NOT_ASSESSED rather than wrong.
 */
export const ANSWER_MATCH_POLICY = { version: "answer-match.v3", maxExtraWords: 3, maxAlternativeWords: 3 } as const;

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
};
const NEGATIONS = new Set(["not", "no", "never", "dont", "doesnt", "isnt", "arent", "cant", "wont", "didnt", "nt", "nao", "nunca", "nem"]);
/** Hesitation sounds: never an answer, never an extra word. */
const FILLER = /^(h+m+|h+u+m+|u+h+m*|u+m+|a+h+n*|e+h+|e+r+m*|hein)$/;
/** Whole responses that say "I don't know" (after hesitations are dropped). */
const NON_ATTEMPTS = new Set([
  "nao sei", "eu nao sei", "nao sei nao", "sei la", "nao lembro", "nao me lembro", "eu nao lembro", "esqueci", "eu esqueci", "nao faco ideia", "nao sei falar",
  "i dont know", "dont know", "i dont remember", "i forgot", "no idea", "idk",
]);
/** Common Portuguese words, written without accents as normalisation leaves them. */
const PORTUGUESE_WORDS = new Set(
  (
    "de da do das dos e o os as um uma uns umas com sem mas tambem pode posso podia falar fala falou dizer disse diz volta pouco muito muita meio que eu ela ele " +
    "voce isso esse essa este esta estou aqui ali la cor cores ou pra para por porque na nas nos num numa tipo assim entao acho sei quero gosto vou vai sim oi ola " +
    "tchau obrigado obrigada mae pai casa agora depois antes hoje dia outro outra mais menos bem legal certo errado ja ainda quando como qual quem onde era foi " +
    "tem ter sao seu sua meu minha cinza azul vermelho verde amarelo rosa preto branco marrom laranja roxo gato cachorro"
  ).split(" "),
);
const PORTUGUESE_LETTERS = /[ãõçáéíóúâêôà]/;
const PORTUGUESE_ENDINGS = /(ado|ada|ados|adas|ido|ida|idos|idas|ando|endo|indo|cao|coes|mente|inho|inha|inhos|inhas)$/;

type Token = { w: string; pt: boolean };

function tokens(text: string): Token[] {
  return text
    .toLowerCase()
    .replace(/n't\b/g, "nt")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const plain = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      return { w: NUMBER_WORDS[plain] ?? plain, pt: PORTUGUESE_LETTERS.test(raw) || PORTUGUESE_WORDS.has(plain) || PORTUGUESE_ENDINGS.test(plain) };
    })
    .filter((t) => t.w);
}

export function normalizeAnswer(text: string): string[] {
  return tokens(text).map((t) => t.w);
}

/** Share of the words (hesitations aside) that are Portuguese: 0 for an English answer, 1 for "Marrom.". */
export function portugueseShare(text: string): number {
  const words = tokens(text).filter((t) => !FILLER.test(t.w));
  return words.length ? words.filter((t) => t.pt).length / words.length : 0;
}

/** "não sei", "hum", "I don't know": the child did not try, so there is nothing to grade. */
export function isNonAttempt(response: string): boolean {
  const words = normalizeAnswer(response);
  const said = words.filter((w) => !FILLER.test(w));
  if (words.length === 0) return false;
  return said.length === 0 || NON_ATTEMPTS.has(said.join(" "));
}

/** "bye ou goodbye", "bye or goodbye", "bye / goodbye": each short alternative is accepted on its own. */
export function acceptedAlternatives(accepted: string[]): string[] {
  const out: string[] = [];
  for (const a of accepted) {
    out.push(a);
    const parts = a.split(/\s+(?:ou|or)\s+|\s*\/\s*/i).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts.every((p) => normalizeAnswer(p).length <= ANSWER_MATCH_POLICY.maxAlternativeWords)) out.push(...parts);
  }
  return [...new Set(out)];
}

export type AnswerMatch = {
  match: boolean;
  method: "exact" | "phrase" | "near" | "none" | "no_attempt";
  result: "CORRECT" | "PARTIALLY_CORRECT" | "INCORRECT" | "NOT_ASSESSED";
};

const NONE: AnswerMatch = { match: false, method: "none", result: "INCORRECT" };
const NO_ATTEMPT: AnswerMatch = { match: false, method: "no_attempt", result: "NOT_ASSESSED" };

/** Edit distance, for short strings only. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** Letters allowed off for a near miss: one for short words, two for longer ones. */
const nearBudget = (len: number) => (len < 3 ? 0 : len <= 5 ? 1 : 2);

function isNear(got: string[], want: string[]): boolean {
  if (want.some((w) => /\d/.test(w))) return false;
  const target = want.join("");
  const budget = nearBudget(target.length);
  if (budget === 0) return false;
  for (let size = Math.max(1, want.length - 1); size <= want.length + 1; size++) {
    for (let i = 0; i + size <= got.length; i++) {
      const window = got.slice(i, i + size);
      if (window.some((w) => /\d/.test(w))) continue;
      if (distance(window.join(""), target) <= budget) return true;
    }
  }
  return false;
}

/** Extra words beyond the answer that count against it: English ones, not Portuguese ones around it. */
function extraWords(got: Token[], want: string[]): number {
  const wanted = new Set(want);
  return got.filter((t) => !t.pt || wanted.has(t.w)).length - want.length;
}

export function matchAnswer(response: string, accepted: string[]): AnswerMatch {
  if (isNonAttempt(response)) return NO_ATTEMPT;
  const all = tokens(response).filter((t) => !FILLER.test(t.w));
  const got = all.map((t) => t.w);
  if (got.length === 0) return NONE;
  const negated = got.some((w) => NEGATIONS.has(w));
  const wants = acceptedAlternatives(accepted).map(normalizeAnswer).filter((w) => w.length > 0);
  for (const want of wants) {
    if (want.join(" ") === got.join(" ")) return { match: true, method: "exact", result: "CORRECT" };
    if (negated && !want.some((w) => NEGATIONS.has(w))) continue;
    if (extraWords(all, want) > ANSWER_MATCH_POLICY.maxExtraWords) continue;
    for (let i = 0; i + want.length <= got.length; i++) {
      if (want.every((w, j) => got[i + j] === w)) return { match: true, method: "phrase", result: "CORRECT" };
    }
  }
  for (const want of wants) {
    if (negated && !want.some((w) => NEGATIONS.has(w))) continue;
    if (extraWords(all, want) > ANSWER_MATCH_POLICY.maxExtraWords) continue;
    if (isNear(got, want)) return { match: false, method: "near", result: "PARTIALLY_CORRECT" };
  }
  return NONE;
}
