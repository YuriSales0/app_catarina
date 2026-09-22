CREATE TYPE "public"."activity_type" AS ENUM('REVIEW', 'EXPLANATION', 'PRACTICE', 'GAME', 'CONVERSATION', 'ASSESSMENT', 'REFLECTION');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('USER', 'SYSTEM', 'AI_PROVIDER');--> statement-breakpoint
CREATE TYPE "public"."audit_result" AS ENUM('ALLOWED', 'DENIED');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('PROCESSING', 'AI_PROCESSING', 'AUDIO_RETENTION', 'ANALYTICS');--> statement-breakpoint
CREATE TYPE "public"."curriculum_source" AS ENUM('OFFICIAL', 'SCHOOL', 'FAMILY', 'TEACHER', 'TEXTBOOK', 'IMPORTED', 'AI_GENERATED', 'MARKETPLACE');--> statement-breakpoint
CREATE TYPE "public"."curriculum_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."evidence_result" AS ENUM('CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT', 'NOT_ASSESSED');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('PRACTICE', 'ASSESSMENT', 'OBSERVATION', 'SELF_REPORT', 'PARENT_REPORT', 'CORRECTION', 'RETRACTION');--> statement-breakpoint
CREATE TYPE "public"."graded_by" AS ENUM('SYSTEM', 'HUMAN', 'AI_PROVIDER');--> statement-breakpoint
CREATE TYPE "public"."guardian_role" AS ENUM('OWNER', 'GUARDIAN', 'TEACHER', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."inference_source" AS ENUM('RULE_ENGINE', 'AI_PROVIDER', 'HUMAN');--> statement-breakpoint
CREATE TYPE "public"."lesson_event_type" AS ENUM('LESSON_STARTED', 'ACTIVITY_STARTED', 'PROMPT_SHOWN', 'STUDENT_RESPONSE', 'CORRECTION', 'ACTIVITY_COMPLETED', 'ASSESSMENT_RESULT', 'TEACHER_NOTE', 'LESSON_PAUSED', 'LESSON_COMPLETED', 'LESSON_CANCELLED', 'AI_PROPOSAL_RECEIVED', 'AI_PROPOSAL_REJECTED');--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."objective_status" AS ENUM('NOT_STARTED', 'INTRODUCED', 'PRACTISING', 'DEVELOPING', 'PROFICIENT', 'MASTERED');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."prerequisite_strength" AS ENUM('HARD', 'SOFT');--> statement-breakpoint
CREATE TYPE "public"."recommendation_kind" AS ENUM('REVIEW', 'NEXT_OBJECTIVE', 'ACTIVITY', 'PACING', 'PARENT_ACTION');--> statement-breakpoint
CREATE TYPE "public"."recommendation_source" AS ENUM('NEXT_LESSON_ENGINE', 'AI_PROVIDER', 'HUMAN');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."report_generator" AS ENUM('SYSTEM', 'AI_PROVIDER', 'HUMAN');--> statement-breakpoint
CREATE TYPE "public"."snapshot_scope" AS ENUM('STUDENT', 'SUBJECT');--> statement-breakpoint
CREATE TYPE "public"."snapshot_trigger" AS ENUM('LESSON_COMPLETED', 'SCHEDULED', 'MANUAL', 'PRE_MIGRATION');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('PRIVATE', 'SHARED', 'PUBLIC');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"name" text,
	"image" text,
	"platform_role" "platform_role" DEFAULT 'USER' NOT NULL,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"policy_version" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_subject_slug_uq" UNIQUE("subject_id","slug")
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "guardian_role" NOT NULL,
	"invited_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardians_student_user_uq" UNIQUE("student_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "student_subjects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"curriculum_version_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"instruction_language" text DEFAULT 'pt-BR' NOT NULL,
	"target_language" text,
	"target_level" text,
	"goal" text,
	"planned_lesson_minutes" integer DEFAULT 20 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_subjects_student_subject_uq" UNIQUE("student_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"date_of_birth" date,
	"school_year" text,
	"education_system" text,
	"timezone" text DEFAULT 'Europe/Lisbon' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "curricula" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" "curriculum_source" NOT NULL,
	"source_url" text,
	"owner_user_id" uuid,
	"visibility" "visibility" DEFAULT 'PRIVATE' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curricula_subject_slug_uq" UNIQUE("subject_id","slug")
);
--> statement-breakpoint
CREATE TABLE "curriculum_units" (
	"id" uuid PRIMARY KEY NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"parent_unit_id" uuid,
	"unit_key" text NOT NULL,
	"lineage_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sequence" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_units_version_key_uq" UNIQUE("curriculum_version_id","unit_key")
);
--> statement-breakpoint
CREATE TABLE "curriculum_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"curriculum_id" uuid NOT NULL,
	"version" text NOT NULL,
	"status" "curriculum_status" DEFAULT 'DRAFT' NOT NULL,
	"instruction_language" text DEFAULT 'pt-BR' NOT NULL,
	"target_language" text,
	"error_tag_vocabulary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_versions_curriculum_version_uq" UNIQUE("curriculum_id","version")
);
--> statement-breakpoint
CREATE TABLE "learning_objectives" (
	"id" uuid PRIMARY KEY NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"curriculum_unit_id" uuid NOT NULL,
	"objective_key" text NOT NULL,
	"lineage_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sequence" integer NOT NULL,
	"difficulty" smallint DEFAULT 1 NOT NULL,
	"estimated_sessions" smallint,
	"error_tags" text[] DEFAULT '{}' NOT NULL,
	"teaching_notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assessment_policy" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_objectives_version_key_uq" UNIQUE("curriculum_version_id","objective_key"),
	CONSTRAINT "learning_objectives_unit_sequence_uq" UNIQUE("curriculum_unit_id","sequence"),
	CONSTRAINT "learning_objectives_difficulty_ck" CHECK ("learning_objectives"."difficulty" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "objective_prerequisites" (
	"objective_id" uuid NOT NULL,
	"prerequisite_objective_id" uuid NOT NULL,
	"required_status" "objective_status" DEFAULT 'PROFICIENT' NOT NULL,
	"strength" "prerequisite_strength" DEFAULT 'HARD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objective_prerequisites_objective_id_prerequisite_objective_id_pk" PRIMARY KEY("objective_id","prerequisite_objective_id"),
	CONSTRAINT "objective_prerequisites_not_self_ck" CHECK ("objective_prerequisites"."objective_id" <> "objective_prerequisites"."prerequisite_objective_id")
);
--> statement-breakpoint
CREATE TABLE "objective_skills" (
	"objective_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"weight" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "objective_skills_objective_id_skill_id_pk" PRIMARY KEY("objective_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "student_objective_review" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"introduced_at" timestamp with time zone,
	"last_practised_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"review_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"interval_days" integer DEFAULT 1 NOT NULL,
	"ease" numeric(4, 2),
	"next_review_at" timestamp with time zone,
	"scheduler_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_objective_review_student_objective_uq" UNIQUE("student_id","objective_id")
);
--> statement-breakpoint
CREATE TABLE "student_objective_state" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"objective_lineage_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" "objective_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"confidence" "confidence_level" DEFAULT 'LOW' NOT NULL,
	"assessed_attempts" integer DEFAULT 0 NOT NULL,
	"success_rate_recent" numeric(4, 3),
	"distinct_lesson_count" integer DEFAULT 0 NOT NULL,
	"has_human_or_system_graded_evidence" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone,
	"last_assessed_at" timestamp with time zone,
	"proficient_since" timestamp with time zone,
	"rule_version" text NOT NULL,
	"decided_by_evidence_ids" uuid[] DEFAULT '{}' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_objective_state_student_objective_uq" UNIQUE("student_id","objective_id")
);
--> statement-breakpoint
CREATE TABLE "student_objective_state_transition" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"from_status" "objective_status" NOT NULL,
	"to_status" "objective_status" NOT NULL,
	"from_confidence" "confidence_level" NOT NULL,
	"to_confidence" "confidence_level" NOT NULL,
	"rule_version" text NOT NULL,
	"triggered_by_evidence_id" uuid,
	"decided_by_evidence_ids" uuid[] DEFAULT '{}' NOT NULL,
	"rationale" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lesson_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"sequence" smallint NOT NULL,
	"activity_type" "activity_type" NOT NULL,
	"objective_id" uuid,
	"skill_id" uuid,
	"instructions" text NOT NULL,
	"expected_evidence_count" smallint,
	"planned_minutes" smallint,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_activities_lesson_sequence_uq" UNIQUE("lesson_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "lesson_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lesson_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"schema_version" text NOT NULL,
	"payload" jsonb NOT NULL,
	"generated_by" "report_generator" NOT NULL,
	"generator_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"primary_objective_id" uuid NOT NULL,
	"lesson_number" integer NOT NULL,
	"planned_duration_minutes" integer DEFAULT 20 NOT NULL,
	"actual_duration_minutes" integer,
	"status" "lesson_status" DEFAULT 'PLANNED' NOT NULL,
	"plan_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"plan_engine_version" text NOT NULL,
	"idempotency_key" text,
	"created_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "lessons_student_subject_number_uq" UNIQUE("student_id","subject_id","lesson_number")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"student_id" uuid,
	"result" "audit_result" NOT NULL,
	"reason" text,
	"ip_hash" text,
	"user_agent" text,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"lesson_id" uuid,
	"activity_id" uuid,
	"objective_id" uuid NOT NULL,
	"objective_lineage_id" uuid NOT NULL,
	"skill_id" uuid,
	"attempt_number" integer NOT NULL,
	"prompt" text NOT NULL,
	"student_response" text,
	"expected_response" text,
	"result" "evidence_result" NOT NULL,
	"correction" text,
	"evidence_type" "evidence_type" NOT NULL,
	"confidence" "confidence_level" DEFAULT 'MEDIUM' NOT NULL,
	"graded_by" "graded_by" NOT NULL,
	"grader_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"supersedes_evidence_id" uuid,
	"error_tags" text[] DEFAULT '{}' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_evidence_attempt_uq" UNIQUE("student_id","objective_id","lesson_id","activity_id","attempt_number"),
	CONSTRAINT "learning_evidence_correction_supersedes_ck" CHECK ("learning_evidence"."evidence_type" NOT IN ('CORRECTION','RETRACTION') OR "learning_evidence"."supersedes_evidence_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "lesson_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lesson_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"activity_id" uuid,
	"event_type" "lesson_event_type" NOT NULL,
	"sequence" bigint NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_events_lesson_sequence_uq" UNIQUE("lesson_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "learning_inference" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"objective_id" uuid,
	"skill_id" uuid,
	"lesson_id" uuid,
	"statement" text NOT NULL,
	"basis_evidence_ids" uuid[] NOT NULL,
	"source" "inference_source" NOT NULL,
	"source_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" "confidence_level" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_recommendation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" "recommendation_kind" NOT NULL,
	"objective_id" uuid,
	"lesson_id" uuid,
	"statement" text NOT NULL,
	"rationale" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" "recommendation_source" NOT NULL,
	"source_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "recommendation_status" DEFAULT 'PROPOSED' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"snapshot_version" integer NOT NULL,
	"schema_version" text NOT NULL,
	"scope" "snapshot_scope" NOT NULL,
	"subject_id" uuid,
	"generated_from" jsonb NOT NULL,
	"state_payload" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_snapshots_student_version_uq" UNIQUE("student_id","snapshot_version")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_subjects" ADD CONSTRAINT "student_subjects_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_subjects" ADD CONSTRAINT "student_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_subjects" ADD CONSTRAINT "student_subjects_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_units" ADD CONSTRAINT "curriculum_units_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_units" ADD CONSTRAINT "curriculum_units_parent_unit_id_curriculum_units_id_fk" FOREIGN KEY ("parent_unit_id") REFERENCES "public"."curriculum_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_objectives" ADD CONSTRAINT "learning_objectives_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_objectives" ADD CONSTRAINT "learning_objectives_curriculum_unit_id_curriculum_units_id_fk" FOREIGN KEY ("curriculum_unit_id") REFERENCES "public"."curriculum_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_prerequisites" ADD CONSTRAINT "objective_prerequisites_objective_id_learning_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."learning_objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_prerequisites" ADD CONSTRAINT "objective_prerequisites_prerequisite_objective_id_learning_objectives_id_fk" FOREIGN KEY ("prerequisite_objective_id") REFERENCES "public"."learning_objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_skills" ADD CONSTRAINT "objective_skills_objective_id_learning_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."learning_objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_skills" ADD CONSTRAINT "objective_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_objective_review" ADD CONSTRAINT "student_objective_review_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_objective_review" ADD CONSTRAINT "student_objective_review_objective_id_learning_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."learning_objectives"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_objective_review" ADD CONSTRAINT "student_objective_review_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_objective_state" ADD CONSTRAINT "student_objective_state_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_objective_state" ADD CONSTRAINT "student_objective_state_objective_id_learning_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."learning_objectives"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_objective_state" ADD CONSTRAINT "student_objective_state_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_objective_state_transition" ADD CONSTRAINT "student_objective_state_transition_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_objective_state_transition" ADD CONSTRAINT "student_objective_state_transition_objective_id_learning_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."learning_objectives"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_activities" ADD CONSTRAINT "lesson_activities_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_activities" ADD CONSTRAINT "lesson_activities_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_activities" ADD CONSTRAINT "lesson_activities_objective_id_learning_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."learning_objectives"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_activities" ADD CONSTRAINT "lesson_activities_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_reports" ADD CONSTRAINT "lesson_reports_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_reports" ADD CONSTRAINT "lesson_reports_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_primary_objective_id_learning_objectives_id_fk" FOREIGN KEY ("primary_objective_id") REFERENCES "public"."learning_objectives"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_activity_id_lesson_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."lesson_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_objective_id_learning_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."learning_objectives"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_events" ADD CONSTRAINT "lesson_events_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_events" ADD CONSTRAINT "lesson_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_events" ADD CONSTRAINT "lesson_events_activity_id_lesson_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."lesson_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_inference" ADD CONSTRAINT "learning_inference_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_inference" ADD CONSTRAINT "learning_inference_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_inference" ADD CONSTRAINT "learning_inference_objective_id_learning_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."learning_objectives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_inference" ADD CONSTRAINT "learning_inference_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_inference" ADD CONSTRAINT "learning_inference_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_recommendation" ADD CONSTRAINT "learning_recommendation_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_recommendation" ADD CONSTRAINT "learning_recommendation_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_recommendation" ADD CONSTRAINT "learning_recommendation_objective_id_learning_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."learning_objectives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_recommendation" ADD CONSTRAINT "learning_recommendation_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_recommendation" ADD CONSTRAINT "learning_recommendation_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_snapshots" ADD CONSTRAINT "learning_snapshots_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_snapshots" ADD CONSTRAINT "learning_snapshots_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "consents_student_kind_idx" ON "consents" USING btree ("student_id","kind");--> statement-breakpoint
CREATE INDEX "skills_subject_idx" ON "skills" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "student_guardians_user_id_idx" ON "student_guardians" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "student_guardians_student_revoked_idx" ON "student_guardians" USING btree ("student_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_guardians_one_owner_uq" ON "student_guardians" USING btree ("student_id") WHERE "student_guardians"."role" = 'OWNER' AND "student_guardians"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "student_subjects_student_active_idx" ON "student_subjects" USING btree ("student_id","active");--> statement-breakpoint
CREATE INDEX "student_subjects_subject_idx" ON "student_subjects" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "student_subjects_curriculum_version_idx" ON "student_subjects" USING btree ("curriculum_version_id");--> statement-breakpoint
CREATE INDEX "students_created_by_idx" ON "students" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "curricula_subject_idx" ON "curricula" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "curricula_owner_idx" ON "curricula" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "curriculum_units_version_idx" ON "curriculum_units" USING btree ("curriculum_version_id");--> statement-breakpoint
CREATE INDEX "curriculum_units_parent_idx" ON "curriculum_units" USING btree ("parent_unit_id");--> statement-breakpoint
CREATE INDEX "curriculum_units_lineage_idx" ON "curriculum_units" USING btree ("lineage_id");--> statement-breakpoint
CREATE INDEX "curriculum_versions_curriculum_idx" ON "curriculum_versions" USING btree ("curriculum_id");--> statement-breakpoint
CREATE INDEX "learning_objectives_version_idx" ON "learning_objectives" USING btree ("curriculum_version_id");--> statement-breakpoint
CREATE INDEX "learning_objectives_unit_idx" ON "learning_objectives" USING btree ("curriculum_unit_id");--> statement-breakpoint
CREATE INDEX "learning_objectives_lineage_idx" ON "learning_objectives" USING btree ("lineage_id");--> statement-breakpoint
CREATE INDEX "objective_prerequisites_objective_idx" ON "objective_prerequisites" USING btree ("objective_id");--> statement-breakpoint
CREATE INDEX "objective_prerequisites_prerequisite_idx" ON "objective_prerequisites" USING btree ("prerequisite_objective_id");--> statement-breakpoint
CREATE INDEX "objective_skills_skill_idx" ON "objective_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "student_objective_review_student_next_idx" ON "student_objective_review" USING btree ("student_id","next_review_at");--> statement-breakpoint
CREATE INDEX "student_objective_review_next_idx" ON "student_objective_review" USING btree ("next_review_at");--> statement-breakpoint
CREATE INDEX "student_objective_state_student_subject_status_idx" ON "student_objective_state" USING btree ("student_id","subject_id","status");--> statement-breakpoint
CREATE INDEX "student_objective_state_student_lineage_idx" ON "student_objective_state" USING btree ("student_id","objective_lineage_id");--> statement-breakpoint
CREATE INDEX "student_objective_state_objective_idx" ON "student_objective_state" USING btree ("objective_id");--> statement-breakpoint
CREATE INDEX "sost_student_objective_created_idx" ON "student_objective_state_transition" USING btree ("student_id","objective_id","created_at");--> statement-breakpoint
CREATE INDEX "sost_created_idx" ON "student_objective_state_transition" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lesson_activities_objective_idx" ON "lesson_activities" USING btree ("objective_id");--> statement-breakpoint
CREATE INDEX "lesson_activities_student_idx" ON "lesson_activities" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "lesson_reports_lesson_generated_idx" ON "lesson_reports" USING btree ("lesson_id","generated_at");--> statement-breakpoint
CREATE INDEX "lesson_reports_student_idx" ON "lesson_reports" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_student_idempotency_uq" ON "lessons" USING btree ("student_id","idempotency_key") WHERE "lessons"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "lessons_student_subject_created_idx" ON "lessons" USING btree ("student_id","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "lessons_status_idx" ON "lessons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lessons_primary_objective_idx" ON "lessons" USING btree ("primary_objective_id");--> statement-breakpoint
CREATE INDEX "lessons_curriculum_version_idx" ON "lessons" USING btree ("curriculum_version_id");--> statement-breakpoint
CREATE INDEX "audit_log_student_created_idx" ON "audit_log" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_created_idx" ON "audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_denied_idx" ON "audit_log" USING btree ("result") WHERE "audit_log"."result" = 'DENIED';--> statement-breakpoint
CREATE INDEX "learning_evidence_student_objective_occurred_idx" ON "learning_evidence" USING btree ("student_id","objective_id","occurred_at");--> statement-breakpoint
CREATE INDEX "learning_evidence_student_subject_created_idx" ON "learning_evidence" USING btree ("student_id","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "learning_evidence_lesson_idx" ON "learning_evidence" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "learning_evidence_supersedes_idx" ON "learning_evidence" USING btree ("supersedes_evidence_id");--> statement-breakpoint
CREATE INDEX "learning_evidence_error_tags_gin" ON "learning_evidence" USING gin ("error_tags");--> statement-breakpoint
CREATE INDEX "lesson_events_student_occurred_idx" ON "lesson_events" USING btree ("student_id","occurred_at");--> statement-breakpoint
CREATE INDEX "lesson_events_type_idx" ON "lesson_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "learning_inference_student_created_idx" ON "learning_inference" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "learning_inference_lesson_idx" ON "learning_inference" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "learning_recommendation_student_status_idx" ON "learning_recommendation" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "learning_recommendation_lesson_idx" ON "learning_recommendation" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "learning_snapshots_student_created_idx" ON "learning_snapshots" USING btree ("student_id","created_at");