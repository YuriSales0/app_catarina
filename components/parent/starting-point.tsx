import type { Placement } from "@/lib/learning/placement";
import { startingPointAction } from "@/app/(parent)/students/starting-point-actions";
import { startTodayAction } from "@/app/(parent)/lessons/today-actions";

/**
 * Where a child starts in a track, and the family's controls over it: start
 * from the very beginning, take the level check, or confirm what a level
 * check suggested. The app never applies a suggestion on its own.
 */
export function StartingPointPanel({
  studentId,
  subjectId,
  placement,
  levelKey,
  canEdit,
  back,
  compact = false,
}: {
  studentId: string;
  subjectId: string;
  placement: Placement | null;
  levelKey: string | null;
  canEdit: boolean;
  back?: string;
  compact?: boolean;
}) {
  const result = placement?.result ?? null;
  const unitName = (key: string | null) => (key ? (result?.units.find((u) => u.unit_key === key)?.unit_name ?? key) : null);
  const form = (choice: string, track: string, label: string, variant: string) => (
    <form action={startingPointAction}>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <input type="hidden" name="choice" value={choice} />
      <input type="hidden" name="track" value={track} />
      {back ? <input type="hidden" name="back" value={back} /> : null}
      <button type="submit" className={`btn ${variant} btn-sm`}>
        {label}
      </button>
    </form>
  );
  const notStarters = levelKey !== "starters" && levelKey !== "other";
  const alreadyAtStart = !notStarters && placement?.status === "SET" && !placement.start_unit_key;

  let status: React.ReactNode;
  if (!placement) status = "Ponto de partida não informado: as aulas seguem a ordem da trilha.";
  else if (placement.status === "PENDING_TEST") status = "A próxima aula é um teste rápido de nível, sem nota. Depois dele, o app sugere por onde começar e você confirma.";
  else if (placement.status === "RESULT_READY" && result) {
    status = result.all_passed ? (
      <>Teste de nível: acertou bem todos os módulos desta trilha. Vale considerar a trilha seguinte.</>
    ) : (
      <>
        Teste de nível: sugerimos começar pelo módulo <strong>{unitName(result.suggested_start_unit_key)}</strong>
        {result.units[0]?.unit_key === result.suggested_start_unit_key ? ", o primeiro da trilha" : ""}. Nada muda até você confirmar.
      </>
    );
  } else if (placement.start_unit_key) status = <>Começa pelo módulo <strong>{unitName(placement.start_unit_key)}</strong>, pelo teste de nível. Os módulos anteriores ficam de fora.</>;
  else status = placement.method === "CHOSEN" ? "Trilha escolhida pela família, começando do início dela." : "Começando do comecinho da trilha.";

  return (
    <div className={`rounded-2xl ${placement?.status === "RESULT_READY" ? "bg-sun text-sun-ink" : "bg-surface-2"} px-4 py-3 text-sm`}>
      {!compact ? <p className="font-bold">Ponto de partida</p> : null}
      <p className={compact ? "" : "mt-1"}>{status}</p>
      {result && placement?.status === "RESULT_READY" ? (
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {result.units.map((u) => (
            <li key={u.unit_key} className="rounded-full bg-surface px-2.5 py-1 text-foreground">
              {u.passed ? "✓" : u.assessed ? "↺" : "—"} {u.unit_name}
              {u.score !== null ? ` · ${Math.round(u.score * 100)}%` : " · não chegou"}
            </li>
          ))}
        </ul>
      ) : null}
      {placement?.status === "PENDING_TEST" && canEdit ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {(["chatgpt", "play"] as const).map((surface) => (
            <form key={surface} action={startTodayAction}>
              <input type="hidden" name="studentId" value={studentId} />
              <input type="hidden" name="subjectId" value={subjectId} />
              <input type="hidden" name="surface" value={surface} />
              <button type="submit" className={`btn btn-sm ${surface === "chatgpt" ? "btn-primary" : "btn-soft"}`}>
                {surface === "chatgpt" ? "💬 Fazer o teste no ChatGPT" : "🦉 Fazer o teste com o Lumi"}
              </button>
            </form>
          ))}
        </div>
      ) : null}
      {canEdit ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {placement?.status === "RESULT_READY" && result && !result.all_passed ? form("CONFIRM_SUGGESTED", "keep", `Começar pelo módulo ${unitName(result.suggested_start_unit_key)}`, "btn-primary") : null}
          {placement?.status === "RESULT_READY" && result?.all_passed ? form("BEGINNER", "movers", "Passar para a trilha Movers", "btn-primary") : null}
          {alreadyAtStart ? null : form("BEGINNER", notStarters ? "starters" : "keep", notStarters ? "Recomeçar do início (Starters)" : "Começar do início", placement?.status === "RESULT_READY" ? "btn-secondary" : "btn-soft")}
          {placement?.status !== "PENDING_TEST" ? form("TEST", notStarters ? "starters" : "keep", "Fazer teste de nível", "btn-ghost") : null}
        </div>
      ) : null}
      {canEdit && !compact ? <p className="mt-2 text-xs opacity-80">Ao mudar o ponto de partida, aulas já planejadas são canceladas. Tudo o que foi feito continua registrado.</p> : null}
    </div>
  );
}
