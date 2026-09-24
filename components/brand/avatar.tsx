import { TONE } from "@/lib/copy/pt";
import type { AvatarAnimal, AvatarChoice } from "@/lib/students/avatar";

export { avatarOf, AVATAR_ANIMAL_KEYS, AVATAR_COLORS, type AvatarChoice, type AvatarAnimal, type AvatarColor } from "@/lib/students/avatar";

export const AVATAR_ANIMALS: Record<AvatarAnimal, { emoji: string; label: string }> = {
  fox: { emoji: "🦊", label: "Raposa" },
  cat: { emoji: "🐱", label: "Gato" },
  panda: { emoji: "🐼", label: "Panda" },
  rabbit: { emoji: "🐰", label: "Coelho" },
  lion: { emoji: "🦁", label: "Leão" },
  frog: { emoji: "🐸", label: "Sapo" },
  octopus: { emoji: "🐙", label: "Polvo" },
  unicorn: { emoji: "🦄", label: "Unicórnio" },
};

const SIZES = { sm: "h-9 w-9 text-lg", md: "h-12 w-12 text-2xl", lg: "h-20 w-20 text-4xl", xl: "h-32 w-32 text-6xl" } as const;

export function Avatar({ choice, size = "md", className = "" }: { choice: AvatarChoice; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full ${TONE[choice.color].bg} ${SIZES[size]} ${className}`}>
      <span className="leading-none">{AVATAR_ANIMALS[choice.animal].emoji}</span>
    </span>
  );
}
