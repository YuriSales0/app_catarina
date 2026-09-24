const COLORS = ["#8b7ff0", "#ffb454", "#7fd1ae", "#7cc4f2", "#ff9fb5", "#ffd166"];

/** Decorative confetti. Deterministic positions so it renders on the server; hidden under reduced motion. */
export function Confetti({ pieces = 36 }: { pieces?: number }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {Array.from({ length: pieces }, (_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 37) % 100}%`,
            background: COLORS[i % COLORS.length],
            animationDelay: `${(i % 12) * 0.15}s`,
            animationDuration: `${2.6 + (i % 5) * 0.35}s`,
            transform: `rotate(${i * 29}deg)`,
          }}
        />
      ))}
    </div>
  );
}
