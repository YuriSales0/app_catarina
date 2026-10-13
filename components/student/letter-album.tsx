import type { Island } from "@/lib/lessons/album";

/**
 * The letter album: the islands of the map with a sticker per letter. Grey
 * stickers are still to discover, coloured ones have been met in a mission,
 * gold ones the system already counts as secure.
 */
export function LetterAlbum({ islands }: { islands: Island[] }) {
  const all = islands.flatMap((i) => i.stickers);
  const met = all.filter((s) => s.look !== "locked").length;
  return (
    <section aria-label="Álbum de letras" className="w-full rounded-3xl bg-surface-2 px-5 py-5 text-left">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">📒 Mi álbum de letras</h2>
        <p className="text-sm font-bold text-muted">
          {met} / {all.length}
        </p>
      </div>
      <ol className="mt-3 space-y-3">
        {islands.map((island) => (
            <li key={island.name}>
              <p className="text-sm font-bold text-muted">
                🏝️ {island.name}
                {island.objectives ? <span className="ml-2 font-normal">{"★".repeat(island.secure)}{"☆".repeat(Math.max(0, island.objectives - island.secure))}</span> : null}
              </p>
              {island.stickers.length ? (
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {island.stickers.map((s) => (
                    <li
                      key={s.letter}
                      title={s.title}
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl font-display text-3xl font-semibold shadow-lift ${
                        s.look === "gold" ? "bg-sun text-sun-ink ring-2 ring-sun-ink" : s.look === "collected" ? "bg-lavender text-lavender-ink" : "bg-surface text-muted opacity-40"
                      }`}
                    >
                      {s.look === "locked" ? "?" : s.letter}
                      <span className="sr-only">{s.look === "gold" ? " (dorada)" : s.look === "collected" ? " (conseguida)" : " (por descubrir)"}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
      </ol>
    </section>
  );
}
