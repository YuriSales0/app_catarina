/**
 * Lumi, the owl who guides the child. Pure SVG so it scales, themes and costs
 * nothing to load. Moods change the eyes and wings only.
 */
export function Lumi({ size = 96, mood = "happy", className = "", title }: { size?: number; mood?: "happy" | "cheer" | "think"; className?: string; title?: string }) {
  const cheer = mood === "cheer";
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} className={className}>
      {title ? <title>{title}</title> : null}
      <ellipse cx="60" cy="112" rx="30" ry="5" fill="#2d2a3e" opacity="0.08" />
      {/* ear tufts */}
      <path d="M30 34 L24 14 L44 28 Z" fill="#7b6ee6" />
      <path d="M90 34 L96 14 L76 28 Z" fill="#7b6ee6" />
      {/* wings */}
      <g transform={cheer ? "translate(-2 -12) rotate(40 24 74)" : undefined}>
        <ellipse cx="24" cy="74" rx="11" ry="22" fill="#6a5ddb" />
      </g>
      <g transform={cheer ? "translate(2 -12) rotate(-40 96 74)" : undefined}>
        <ellipse cx="96" cy="74" rx="11" ry="22" fill="#6a5ddb" />
      </g>
      {/* body */}
      <ellipse cx="60" cy="68" rx="38" ry="42" fill="#8b7ff0" />
      <ellipse cx="60" cy="82" rx="24" ry="24" fill="#f3eefe" />
      <path d="M50 78 q5 4 10 0 q5 4 10 0 M46 88 q7 4 14 0 q7 4 14 0" stroke="#c9bdf8" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* eyes */}
      <circle cx="44" cy="52" r="15" fill="#ffffff" />
      <circle cx="76" cy="52" r="15" fill="#ffffff" />
      {mood === "happy" || cheer ? (
        <>
          <path d="M37 54 q7 -8 14 0" stroke="#2d2a3e" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M69 54 q7 -8 14 0" stroke="#2d2a3e" strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="47" cy="50" r="6" fill="#2d2a3e" />
          <circle cx="79" cy="50" r="6" fill="#2d2a3e" />
          <circle cx="49" cy="48" r="2" fill="#ffffff" />
          <circle cx="81" cy="48" r="2" fill="#ffffff" />
        </>
      )}
      {/* beak and cheeks */}
      <path d="M55 62 L65 62 L60 71 Z" fill="#ffb454" />
      <circle cx="34" cy="66" r="5" fill="#ff9fb5" opacity="0.7" />
      <circle cx="86" cy="66" r="5" fill="#ff9fb5" opacity="0.7" />
      {/* feet */}
      <path d="M48 108 l-4 4 M52 108 v5 M56 108 l4 4 M64 108 l-4 4 M68 108 v5 M72 108 l4 4" stroke="#ffb454" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Lumi with a speech bubble: how the owl talks to the child. */
export function LumiSays({ children, mood = "happy", size = 72 }: { children: React.ReactNode; mood?: "happy" | "cheer" | "think"; size?: number }) {
  return (
    <div className="flex items-end gap-3">
      <Lumi size={size} mood={mood} className="shrink-0 animate-float" />
      <div className="relative mb-3 rounded-3xl rounded-bl-md bg-surface px-5 py-3 text-lg leading-snug shadow-soft">{children}</div>
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Lumi size={34} />
      <span className="font-display text-lg font-semibold tracking-tight">
        Learning <span className="text-primary">OS</span>
      </span>
    </span>
  );
}
