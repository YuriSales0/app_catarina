import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent, listEnrolments, getAiProcessingConsent } from "@/lib/students/service";
import { getSubjectBySlug, listPublishedVersionsForSubject } from "@/lib/curriculum/service";
import { describeLevel, suggestedLevelKey } from "@/lib/curriculum/levels";
import { ActionForm } from "@/components/forms/action-form";
import { AvatarPicker, LevelPicker, MinutesPicker } from "@/components/forms/pickers";
import { TimezoneInput } from "@/components/forms/timezone-input";
import { Avatar, avatarOf } from "@/components/brand/avatar";
import { Lumi, LumiSays } from "@/components/brand/lumi";
import { Field, ageYears } from "@/components/ui";
import { onboardChildAction, onboardLevelAction, onboardAiAction } from "./actions";
import { startTodayAction } from "@/app/(parent)/lessons/today-actions";

export const metadata = { title: "Primeiros passos" };

const STEPS = ["Criança", "Nível", "IA", "Pronto"];

export default async function WelcomePage(props: { searchParams: Promise<{ passo?: string; crianca?: string }> }) {
  await requireActor();
  const sp = await props.searchParams;
  const step = Math.min(4, Math.max(1, Number(sp.passo) || 1));
  const childId = z.string().uuid().safeParse(sp.crianca).success ? sp.crianca! : null;
  if (step > 1 && !childId) redirect("/boas-vindas");

  return (
    <div className="space-y-8">
      <Stepper current={step} />
      {step === 1 ? <ChildStep /> : null}
      {step > 1 && childId ? <ChildSteps step={step} childId={childId} /> : null}
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Etapas">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${state === "done" ? "bg-primary text-primary-foreground" : state === "current" ? "bg-primary-soft text-primary-strong ring-2 ring-primary" : "bg-surface-2 text-muted"}`}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className={`hidden text-sm font-bold sm:inline ${state === "todo" ? "text-muted" : ""}`}>{label}</span>
            {n < STEPS.length ? <span aria-hidden className={`h-0.5 flex-1 rounded ${n < current ? "bg-primary" : "bg-border"}`} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function ChildStep() {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.4fr]">
      <div className="lg:pt-6">
        <LumiSays mood="cheer" size={88}>
          Oi! Eu sou o Lumi. Quem vai aprender inglês comigo?
        </LumiSays>
        <p className="mt-6 text-sm text-muted">O primeiro nome basta. A data de nascimento ajuda a sugerir o nível e a deixar as atividades do tamanho certo.</p>
      </div>
      <div className="card">
        <ActionForm action={onboardChildAction} submitLabel="Continuar" size="lg" className="space-y-5">
          <TimezoneInput />
          <Field label="Primeiro nome">
            <input name="name" required maxLength={60} className="input text-base" autoComplete="off" placeholder="Ex.: Catarina" />
          </Field>
          <Field label="Data de nascimento" hint="Opcional.">
            <input name="dateOfBirth" type="date" className="input" />
          </Field>
          <AvatarPicker />
        </ActionForm>
      </div>
    </div>
  );
}

async function ChildSteps({ step, childId }: { step: number; childId: string }) {
  const actor = await requireActor();
  const { access, student } = await or404(async () => {
    const access = await requireStudentAccess(actor, childId, "VIEW");
    return { access, student: await getStudent(access) };
  });
  const avatar = avatarOf(student);
  const age = ageYears(student.dateOfBirth);

  if (step === 2) {
    const english = await getSubjectBySlug("english");
    const versions = await listPublishedVersionsForSubject(actor, english.id);
    const real = versions.filter((v) => !v.isDemo);
    const options = (real.length ? real : versions).map((v) => ({ versionId: v.versionId, curriculumName: v.curriculumName, version: v.version, isDemo: v.isDemo }));
    return (
      <div className="card space-y-6">
        <div className="flex items-center gap-4">
          <Avatar choice={avatar} size="lg" />
          <div>
            <h1 className="font-display text-2xl font-semibold">Qual é o ponto de partida de {student.name}?</h1>
            <p className="text-sm text-muted">{age !== null ? `Com ${age} anos, sugerimos o nível marcado. ` : ""}Dá para mudar depois, e o avanço já feito é preservado.</p>
          </div>
        </div>
        <ActionForm action={onboardLevelAction} submitLabel="Continuar" size="lg" className="space-y-6">
          <input type="hidden" name="studentId" value={student.id} />
          <LevelPicker options={options} suggested={suggestedLevelKey(age)} />
          <MinutesPicker value={15} />
          <p className="text-xs text-muted">O inglês é ensinado com instruções em português.</p>
        </ActionForm>
      </div>
    );
  }

  if (step === 3) {
    const current = await getAiProcessingConsent(access);
    return (
      <div className="card space-y-6">
        <div className="flex items-start gap-4">
          <Lumi size={72} mood="think" />
          <div>
            <h1 className="font-display text-2xl font-semibold">Aulas com inteligência artificial</h1>
            <p className="mt-1 text-sm text-muted">Quando a IA está ligada, ela prepara as atividades, corrige respostas abertas e comenta a aula. Você pode mudar isso a qualquer momento no perfil.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-mint p-5 text-sm">
            <p className="font-bold text-mint-ink">O que a IA recebe</p>
            <ul className="mt-2 space-y-1">
              <li>• O primeiro nome e a idade de {student.name}</li>
              <li>• O objetivo da aula e as tentativas recentes</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-rose p-5 text-sm">
            <p className="font-bold text-rose-ink">O que a IA não pode fazer</p>
            <ul className="mt-2 space-y-1">
              <li>• Decidir o que foi aprendido</li>
              <li>• Mudar o progresso ou o currículo</li>
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <form action={onboardAiAction}>
            <input type="hidden" name="studentId" value={student.id} />
            <input type="hidden" name="enabled" value="true" />
            <button type="submit" className="btn btn-primary btn-lg">
              Sim, usar IA quando disponível
            </button>
          </form>
          <form action={onboardAiAction}>
            <input type="hidden" name="studentId" value={student.id} />
            <input type="hidden" name="enabled" value="false" />
            <button type="submit" className="btn btn-secondary btn-lg">
              Agora não
            </button>
          </form>
        </div>
        {current ? <p className="text-xs text-muted">Hoje está ligado.</p> : null}
      </div>
    );
  }

  const enrolment = (await listEnrolments(access)).find((e) => e.curriculumVersionId);
  const level = enrolment?.curriculumName ? describeLevel(enrolment.curriculumName) : null;
  return (
    <div className="kid-card relative overflow-hidden text-center">
      <div aria-hidden className="pointer-events-none absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-sun blur-3xl" />
      <div className="relative">
        <div className="flex items-end justify-center gap-2">
          <Avatar choice={avatar} size="xl" className="animate-pop" />
          <Lumi size={96} mood="cheer" className="animate-float" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold">Tudo pronto, {student.name}!</h1>
        <p className="mx-auto mt-2 max-w-md text-muted">
          {level ? `Trilha ${level.title}${level.cefr ? ` (${level.cefr})` : ""}, aulas de ${enrolment!.plannedLessonMinutes} minutos.` : "Falta escolher um nível."} A primeira aula já está esperando.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {enrolment ? (
            <form action={startTodayAction}>
              <input type="hidden" name="studentId" value={student.id} />
              <input type="hidden" name="subjectId" value={enrolment.subjectId} />
              <input type="hidden" name="surface" value="play" />
              <button type="submit" className="kid-btn bg-primary text-primary-foreground shadow-lift hover:bg-primary-strong">
                Começar a primeira aula
              </button>
            </form>
          ) : (
            <Link href={`/boas-vindas?passo=2&crianca=${student.id}`} className="btn btn-primary btn-lg">
              Escolher nível
            </Link>
          )}
          <Link href="/dashboard" className="btn btn-secondary btn-lg">
            Ir para o painel
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted">
          Tem mais uma criança?{" "}
          <Link href="/boas-vindas" className="font-bold text-primary underline-offset-2 hover:underline">
            Cadastrar outra
          </Link>
        </p>
      </div>
    </div>
  );
}
