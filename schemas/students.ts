import { z } from "zod";
import { GUARDIAN_ROLES } from "@/lib/db/enums";
import { AVATAR_ANIMAL_KEYS, AVATAR_COLORS } from "@/lib/students/avatar";

const bcp47 = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "expected a BCP-47 tag such as en or pt-BR");
const uuid = z.string().uuid();

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));

const studentFields = {
  name: z.string().trim().min(1).max(60),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  schoolYear: optionalText(40),
  educationSystem: optionalText(40),
  timezone: z.string().trim().min(1).max(64),
  avatarAnimal: z.enum(AVATAR_ANIMAL_KEYS).optional().or(z.literal("").transform(() => undefined)),
  avatarColor: z.enum(AVATAR_COLORS).optional().or(z.literal("").transform(() => undefined)),
};

export const createStudentSchema = z.object({ ...studentFields, timezone: studentFields.timezone.default("America/Sao_Paulo") }).strict();
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

/** No defaults here: a field left out of an update is left alone. */
export const updateStudentSchema = z.object(studentFields).partial().strict();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const addGuardianSchema = z
  .object({
    email: z.string().trim().email().max(200),
    role: z.enum(GUARDIAN_ROLES).refine((r) => r !== "OWNER", "a student has exactly one OWNER"),
  })
  .strict();
export type AddGuardianInput = z.infer<typeof addGuardianSchema>;

export const enrolStudentSchema = z
  .object({
    subjectId: uuid,
    curriculumVersionId: uuid,
    instructionLanguage: bcp47.default("pt-BR"),
    targetLanguage: bcp47.optional().or(z.literal("").transform(() => undefined)),
    targetLevel: z.string().trim().max(20).optional().or(z.literal("").transform(() => undefined)),
    goal: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
    plannedLessonMinutes: z.coerce.number().int().min(5).max(90).default(20),
  })
  .strict();
export type EnrolStudentInput = z.infer<typeof enrolStudentSchema>;

export const studentIdParam = uuid;
