/** Avatar choices, stored in students.metadata.avatar. Shared by schemas and UI. */
export const AVATAR_ANIMAL_KEYS = ["fox", "cat", "panda", "rabbit", "lion", "frog", "octopus", "unicorn"] as const;
export type AvatarAnimal = (typeof AVATAR_ANIMAL_KEYS)[number];

export const AVATAR_COLORS = ["peach", "sky", "mint", "sun", "lavender", "rose"] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export type AvatarChoice = { animal: AvatarAnimal; color: AvatarColor };

/** Reads the avatar from student metadata, with a stable default derived from the name. */
export function avatarOf(student: { name: string; metadata?: unknown }): AvatarChoice {
  const raw = (student.metadata as { avatar?: Partial<AvatarChoice> } | null | undefined)?.avatar;
  const seed = [...student.name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const animal = raw?.animal && (AVATAR_ANIMAL_KEYS as readonly string[]).includes(raw.animal) ? raw.animal : AVATAR_ANIMAL_KEYS[seed % AVATAR_ANIMAL_KEYS.length];
  const color = raw?.color && (AVATAR_COLORS as readonly string[]).includes(raw.color) ? raw.color : AVATAR_COLORS[seed % AVATAR_COLORS.length];
  return { animal, color };
}
