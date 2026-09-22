import { z } from "zod";
import { GUARDIAN_ROLES } from "@/lib/db/enums";

const bcp47 = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "expected a BCP-47 tag such as en or pt-BR");
const uuid = z.string().uuid();

export const createStudentSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    schoolYear: z.string().trim().max(40).optional().or(z.literal("").transform(() => undefined)),
    educationSystem: z.string().trim().max(40).optional().or(z.literal("").transform(() => undefined)),
    timezone: z.string().trim().min(1).max(64).default("Europe/Lisbon"),
  })
  .strict();
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial().strict();
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
