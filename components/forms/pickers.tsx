import { AVATAR_ANIMALS, AVATAR_ANIMAL_KEYS, AVATAR_COLORS, type AvatarChoice } from "@/components/brand/avatar";
import { TONE } from "@/lib/copy/pt";
import { describeLevel, type LevelInfo } from "@/lib/curriculum/levels";

const COLOR_LABEL: Record<(typeof AVATAR_COLORS)[number], string> = { peach: "Pêssego", sky: "Céu", mint: "Menta", sun: "Sol", lavender: "Lavanda", rose: "Rosa" };

/** Pick an animal and a colour. Plain radios, so it works without JavaScript. */
export function AvatarPicker({ value }: { value?: Partial<AvatarChoice> }) {
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Escolha um bicho</legend>
        <div className="grid grid-cols-4 gap-2">
          {AVATAR_ANIMAL_KEYS.map((k, i) => (
            <label key={k} className="choice flex flex-col items-center gap-1 p-3 text-center">
              <input type="radio" name="avatarAnimal" value={k} defaultChecked={value?.animal ? value.animal === k : i === 0} className="sr-only" />
              <span className="text-3xl leading-none" aria-hidden>
                {AVATAR_ANIMALS[k].emoji}
              </span>
              <span className="text-xs font-bold">{AVATAR_ANIMALS[k].label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-bold">E uma cor</legend>
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c, i) => (
            <label key={c} className={`choice flex items-center gap-2 rounded-full px-3 py-2`}>
              <input type="radio" name="avatarColor" value={c} defaultChecked={value?.color ? value.color === c : i === 0} className="sr-only" />
              <span className={`h-6 w-6 rounded-full ${TONE[c].bg} ring-1 ring-black/5`} aria-hidden />
              <span className="text-xs font-bold">{COLOR_LABEL[c]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export type LevelOption = { versionId: string; curriculumName: string; version: string; isDemo: boolean };

/** Curriculum versions as level cards, with the age-based suggestion marked. */
export function LevelPicker({ options, suggested, current }: { options: LevelOption[]; suggested?: LevelInfo["key"]; current?: string | null }) {
  const levels = options.map((o) => ({ ...o, info: describeLevel(o.curriculumName) }));
  const preselect = current ?? levels.find((l) => l.info.key === suggested)?.versionId ?? levels[0]?.versionId;
  return (
    <fieldset>
      <legend className="sr-only">Nível</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {levels.map((l) => (
          <label key={l.versionId} className="choice flex gap-4">
            <input type="radio" name="curriculumVersionId" value={l.versionId} defaultChecked={l.versionId === preselect} required className="sr-only" />
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${TONE[l.info.tone].bg}`} aria-hidden>
              {l.info.emoji}
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-semibold">{l.info.title}</span>
                {l.info.cefr ? <span className={`badge border-transparent ${TONE[l.info.tone].bg} ${TONE[l.info.tone].ink}`}>{l.info.cefr}</span> : null}
                {l.info.key === suggested && !current ? <span className="badge border-transparent bg-sun text-sun-ink">sugerido</span> : null}
                {l.isDemo ? <span className="badge">DEMO</span> : null}
              </span>
              {l.info.ageFrom ? <span className="block text-xs font-bold text-muted">a partir de {l.info.ageFrom} anos</span> : null}
              <span className="mt-1 block text-sm text-muted">{l.info.blurb}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The first question about a child's English: starting from zero, or with
 * some experience (a short level check suggests where to start), or the
 * family picks the track. Starting from zero is preselected: it is the safe
 * default and never skips anything.
 */
export function ExperiencePicker({ name, children }: { name: string; children?: React.ReactNode }) {
  const options = [
    { value: "BEGINNER", emoji: "🌱", title: "Está começando agora", text: `Nunca estudou inglês ou só conhece palavras soltas. ${name} começa do comecinho: cumprimentos, pessoas, números, cores.` },
    { value: "TEST", emoji: "🧭", title: "Já teve contato com inglês", text: "Na escola, em curso ou em casa. A primeira aula é um teste rápido de nível, sem nota, e o app sugere por onde começar. Você confirma." },
    { value: "CHOSEN", emoji: "🗺️", title: "Prefiro escolher a trilha", text: "Você escolhe o nível abaixo e as aulas começam do início dele." },
  ];
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-bold">{name} já teve contato com inglês?</legend>
      {options.map((o) => (
        <label key={o.value} className="choice flex gap-4">
          <input type="radio" name="experience" value={o.value} defaultChecked={o.value === "BEGINNER"} required className="sr-only" />
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-2xl" aria-hidden>
            {o.emoji}
          </span>
          <span className="min-w-0">
            <span className="font-display text-lg font-semibold">{o.title}</span>
            <span className="mt-1 block text-sm text-muted">{o.text}</span>
          </span>
        </label>
      ))}
      {children}
    </fieldset>
  );
}

export function MinutesPicker({ value = 20 }: { value?: number }) {
  const options = [10, 15, 20, 30];
  const chosen = options.includes(value) ? value : 20;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">Duração de cada aula</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((m) => (
          <label key={m} className="choice rounded-full px-4 py-2">
            <input type="radio" name="plannedLessonMinutes" value={m} defaultChecked={m === chosen} className="sr-only" />
            <span className="text-sm font-bold">{m} min</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Conversation quality for AI lessons. Plain radios. */
export function QualityPicker({ value = "standard" }: { value?: "standard" | "high" }) {
  const options = [
    { key: "standard", title: "Padrão", emoji: "🌿", text: "Ótimo para exercícios com resposta certa e correção de palavras e frases curtas. Mais econômico." },
    { key: "high", title: "Alto", emoji: "✨", text: "Um modelo melhor para conversa aberta, correção com nuance, aberturas de módulo e comentários da aula." },
  ] as const;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">Qualidade da conversa com a IA</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.key} className="choice flex gap-3">
            <input type="radio" name="quality" value={o.key} defaultChecked={value === o.key} className="sr-only" />
            <span className="text-2xl" aria-hidden>
              {o.emoji}
            </span>
            <span>
              <span className="block font-display text-lg font-semibold">{o.title}</span>
              <span className="block text-sm text-muted">{o.text}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
