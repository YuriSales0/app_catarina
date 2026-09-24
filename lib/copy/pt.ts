import type { ActivityType, ConfidenceLevel, EvidenceResult, EvidenceType, GuardianRole, LessonStatus, ObjectiveStatus, RecommendationKind } from "@/lib/db/enums";

/**
 * All user-facing copy (pt-BR) in one place: app strings and the friendly
 * labels for every system enum. The database keeps its English enums; only
 * the words people read change.
 */
export const copy = {
  appName: "Learning OS",
  tagline: "Inglês de verdade, no ritmo do seu filho.",
  login: {
    title: "Que bom ver você",
    subtitle: "Entre para acompanhar e planejar as aulas.",
    google: "Continuar com o Google",
    devTitle: "Entrada de desenvolvimento",
    devHint: "Só fora de produção. Qualquer e-mail cria uma conta de responsável.",
    email: "E-mail",
    name: "Nome",
    submit: "Entrar",
    accessTitle: "Entrar com código de acesso",
    accessHint: "Para convidados. Use o e-mail do seu convite.",
    accessCode: "Código de acesso",
    noProviders: "Nenhuma forma de entrada está configurada. Defina AUTH_GOOGLE_ID e AUTH_GOOGLE_SECRET, ou AUTH_DEV_LOGIN=true em desenvolvimento.",
    failed: "Não conseguimos entrar com esses dados. Confira e tente de novo.",
  },
  nav: {
    dashboard: "Início",
    students: "Crianças",
    curricula: "Currículos",
    kids: "Modo criança",
    signOut: "Sair",
  },
  demoBadge: "DEMO",
  demoNotice: "Dados de demonstração. Este não é o histórico de uma criança real.",
  working: "Um momento…",
} as const;

type StatusMeta = { label: string; short: string; emoji: string; tone: Tone; order: number };
export type Tone = "neutral" | "sky" | "mint" | "peach" | "sun" | "lavender" | "rose" | "primary";

/** The learning journey in family words: a seed that grows into a star. */
export const STATUS: Record<ObjectiveStatus, StatusMeta> = {
  NOT_STARTED: { label: "Ainda não começou", short: "A começar", emoji: "🌱", tone: "neutral", order: 0 },
  INTRODUCED: { label: "Conheceu", short: "Conheceu", emoji: "🌿", tone: "sky", order: 1 },
  PRACTISING: { label: "Praticando", short: "Praticando", emoji: "🍃", tone: "sun", order: 2 },
  DEVELOPING: { label: "Ganhando confiança", short: "Ganhando confiança", emoji: "🌷", tone: "peach", order: 3 },
  PROFICIENT: { label: "Já consegue", short: "Já consegue", emoji: "🌸", tone: "mint", order: 4 },
  MASTERED: { label: "Dominou", short: "Dominou", emoji: "⭐", tone: "lavender", order: 5 },
};

/** Tailwind classes for a tone: pastel background, readable ink. */
export const TONE: Record<Tone, { bg: string; ink: string; solid: string; ring: string }> = {
  neutral: { bg: "bg-surface-2", ink: "text-muted", solid: "bg-border", ring: "border-border" },
  sky: { bg: "bg-sky", ink: "text-sky-ink", solid: "bg-sky-ink", ring: "border-sky-ink/30" },
  mint: { bg: "bg-mint", ink: "text-mint-ink", solid: "bg-mint-ink", ring: "border-mint-ink/30" },
  peach: { bg: "bg-peach", ink: "text-peach-ink", solid: "bg-peach-ink", ring: "border-peach-ink/30" },
  sun: { bg: "bg-sun", ink: "text-sun-ink", solid: "bg-sun-ink", ring: "border-sun-ink/30" },
  lavender: { bg: "bg-lavender", ink: "text-lavender-ink", solid: "bg-lavender-ink", ring: "border-lavender-ink/30" },
  rose: { bg: "bg-rose", ink: "text-rose-ink", solid: "bg-rose-ink", ring: "border-rose-ink/30" },
  primary: { bg: "bg-primary-soft", ink: "text-primary-strong", solid: "bg-primary", ring: "border-primary/30" },
};

export const CONFIDENCE: Record<ConfidenceLevel, string> = { LOW: "confiança baixa", MEDIUM: "confiança média", HIGH: "confiança alta" };

export const RESULT: Record<EvidenceResult, string> = {
  CORRECT: "Acertou",
  PARTIALLY_CORRECT: "Quase",
  INCORRECT: "Ainda não",
  NOT_ASSESSED: "Sem avaliação",
};

export const EVIDENCE_TYPE: Record<EvidenceType, string> = {
  PRACTICE: "prática",
  ASSESSMENT: "avaliação (sem ajuda)",
  OBSERVATION: "observação",
  SELF_REPORT: "relato da criança",
  PARENT_REPORT: "relato do responsável (fora da aula)",
  CORRECTION: "correção",
  RETRACTION: "retratação",
};

/** Activity names for adults, and the playful version the child sees. */
export const ACTIVITY: Record<ActivityType, { adult: string; kid: string; emoji: string; tone: Tone }> = {
  REVIEW: { adult: "Revisão", kid: "Vamos lembrar!", emoji: "🔁", tone: "sky" },
  EXPLANATION: { adult: "Apresentação", kid: "Coisa nova!", emoji: "✨", tone: "lavender" },
  PRACTICE: { adult: "Prática", kid: "Vamos praticar!", emoji: "✏️", tone: "sun" },
  GAME: { adult: "Jogo", kid: "Hora do jogo!", emoji: "🎲", tone: "peach" },
  CONVERSATION: { adult: "Conversa", kid: "Vamos conversar!", emoji: "💬", tone: "mint" },
  ASSESSMENT: { adult: "Desafio (avaliação)", kid: "Mostre o que você sabe!", emoji: "🏅", tone: "rose" },
  REFLECTION: { adult: "Reflexão", kid: "Pensando no que aprendi", emoji: "💭", tone: "sky" },
};

export const LESSON_STATUS: Record<LessonStatus, string> = {
  PLANNED: "Planejada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export const ROLE: Record<GuardianRole, string> = { OWNER: "responsável principal", GUARDIAN: "responsável", TEACHER: "professor(a)", VIEWER: "só visualiza" };

export const RECOMMENDATION_KIND: Record<RecommendationKind, string> = {
  REVIEW: "Revisão",
  NEXT_OBJECTIVE: "Próximo objetivo",
  ACTIVITY: "Atividade",
  PACING: "Ritmo",
  PARENT_ACTION: "Para a família",
};

export const SKILL: Record<string, string> = {
  listening: "Ouvir",
  speaking: "Falar",
  reading: "Ler",
  writing: "Escrever",
  vocabulary: "Vocabulário",
  grammar: "Gramática",
  pronunciation: "Pronúncia",
};

/** Why the engine picked the next objective, in one family-friendly line. */
export const REASON: Record<string, string> = {
  NEXT_IN_SEQUENCE: "Próximo passo da trilha",
  DEVELOPING_CONTINUATION: "Continuar ganhando confiança",
  PRACTISING_CONTINUATION: "Continuar praticando",
  INTRODUCED_CONTINUATION: "Praticar o que acabou de conhecer",
  REVIEW_DUE: "Revisão na hora certa",
  RETENTION_CHECK: "Conferir se ficou na memória",
  RECURRING_ERROR: "Reforçar um ponto que se repete",
  MANUAL_SELECTION: "Escolhido por você",
};

export const PLAN_OUTCOME: Record<string, { title: string; text: string }> = {
  CURRICULUM_COMPLETE: { title: "Trilha concluída!", text: "Todos os objetivos deste currículo foram dominados. Hora de subir de nível." },
  BLOCKED: { title: "Nada liberado ainda", text: "Os próximos objetivos dependem de outros que ainda precisam avançar. Veja abaixo quais são." },
  NEEDS_CURRICULUM: { title: "Escolha um currículo", text: "O motor não adivinha um currículo. Escolha um nível no perfil da criança." },
  REVIEW_ONLY: { title: "Hoje é dia de revisão", text: "Nada novo por enquanto, mas alguns objetivos pedem uma revisão para não serem esquecidos." },
};

export function greeting(now = new Date(), timeZone = "America/Sao_Paulo"): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(now));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
