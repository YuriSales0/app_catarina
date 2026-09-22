-- Custom migration: guarantees Drizzle cannot express.
-- 1. Append-only tables: UPDATE and DELETE are refused by trigger.
-- 2. Published curriculum versions are frozen.
-- 3. Runtime role privileges: SELECT/INSERT only on the ledger tables.
-- Every statement is idempotent.

CREATE OR REPLACE FUNCTION learning_os_refuse_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only: % refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'learning_evidence',
    'lesson_events',
    'learning_snapshots',
    'student_objective_state_transition',
    'audit_log',
    'learning_inference'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_append_only', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION learning_os_refuse_mutation()',
      t || '_append_only', t
    );
  END LOOP;
END $$;
--> statement-breakpoint
-- learning_recommendation: only status/decided_* may change after insert; never deleted.
CREATE OR REPLACE FUNCTION learning_os_recommendation_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'learning_recommendation is never deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.student_id <> OLD.student_id OR NEW.subject_id <> OLD.subject_id OR NEW.kind <> OLD.kind
     OR NEW.statement <> OLD.statement OR NEW.rationale::text <> OLD.rationale::text
     OR NEW.source <> OLD.source OR NEW.created_at <> OLD.created_at
     OR NEW.objective_id IS DISTINCT FROM OLD.objective_id OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id THEN
    RAISE EXCEPTION 'learning_recommendation: only status and decision fields may change'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS learning_recommendation_guard ON learning_recommendation;
--> statement-breakpoint
CREATE TRIGGER learning_recommendation_guard BEFORE UPDATE OR DELETE ON learning_recommendation
  FOR EACH ROW EXECUTE FUNCTION learning_os_recommendation_guard();
--> statement-breakpoint
-- Publish freeze: units and objectives of a PUBLISHED version cannot change.
CREATE OR REPLACE FUNCTION learning_os_version_is_published(v uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM curriculum_versions WHERE id = v AND status = 'PUBLISHED');
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION learning_os_freeze_published() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE vid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN vid := OLD.curriculum_version_id; ELSE vid := NEW.curriculum_version_id; END IF;
  IF learning_os_version_is_published(vid) THEN
    RAISE EXCEPTION 'curriculum version % is published and frozen: % on % refused', vid, TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.curriculum_version_id <> OLD.curriculum_version_id
     AND learning_os_version_is_published(OLD.curriculum_version_id) THEN
    RAISE EXCEPTION 'cannot move rows out of a published curriculum version'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS curriculum_units_freeze ON curriculum_units;
--> statement-breakpoint
CREATE TRIGGER curriculum_units_freeze BEFORE INSERT OR UPDATE OR DELETE ON curriculum_units
  FOR EACH ROW EXECUTE FUNCTION learning_os_freeze_published();
--> statement-breakpoint
DROP TRIGGER IF EXISTS learning_objectives_freeze ON learning_objectives;
--> statement-breakpoint
CREATE TRIGGER learning_objectives_freeze BEFORE INSERT OR UPDATE OR DELETE ON learning_objectives
  FOR EACH ROW EXECUTE FUNCTION learning_os_freeze_published();
--> statement-breakpoint
-- Prerequisites and skill links reference objectives; freeze through the objective's version.
CREATE OR REPLACE FUNCTION learning_os_freeze_published_via_objective() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE oid uuid; vid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN oid := OLD.objective_id; ELSE oid := NEW.objective_id; END IF;
  SELECT curriculum_version_id INTO vid FROM learning_objectives WHERE id = oid;
  IF vid IS NOT NULL AND learning_os_version_is_published(vid) THEN
    RAISE EXCEPTION 'curriculum version % is published and frozen: % on % refused', vid, TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS objective_prerequisites_freeze ON objective_prerequisites;
--> statement-breakpoint
CREATE TRIGGER objective_prerequisites_freeze BEFORE INSERT OR UPDATE OR DELETE ON objective_prerequisites
  FOR EACH ROW EXECUTE FUNCTION learning_os_freeze_published_via_objective();
--> statement-breakpoint
DROP TRIGGER IF EXISTS objective_skills_freeze ON objective_skills;
--> statement-breakpoint
CREATE TRIGGER objective_skills_freeze BEFORE INSERT OR UPDATE OR DELETE ON objective_skills
  FOR EACH ROW EXECUTE FUNCTION learning_os_freeze_published_via_objective();
--> statement-breakpoint
-- A published version may only move to ARCHIVED; its content columns are frozen.
CREATE OR REPLACE FUNCTION learning_os_version_status_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'PUBLISHED' THEN
    IF NEW.status NOT IN ('PUBLISHED', 'ARCHIVED') THEN
      RAISE EXCEPTION 'a published curriculum version cannot return to DRAFT'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.error_tag_vocabulary::text <> OLD.error_tag_vocabulary::text
       OR NEW.instruction_language <> OLD.instruction_language
       OR NEW.target_language IS DISTINCT FROM OLD.target_language
       OR NEW.version <> OLD.version THEN
      RAISE EXCEPTION 'published curriculum version content is frozen'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS curriculum_versions_status_guard ON curriculum_versions;
--> statement-breakpoint
CREATE TRIGGER curriculum_versions_status_guard BEFORE UPDATE ON curriculum_versions
  FOR EACH ROW EXECUTE FUNCTION learning_os_version_status_guard();
--> statement-breakpoint
-- Runtime role privileges. Applied only where the role exists (not in ad-hoc test databases).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'learning_os_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO learning_os_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO learning_os_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO learning_os_app';
    EXECUTE 'REVOKE UPDATE, DELETE ON learning_evidence, lesson_events, learning_snapshots, student_objective_state_transition, audit_log, learning_inference FROM learning_os_app';
    EXECUTE 'REVOKE DELETE ON learning_recommendation FROM learning_os_app';
  END IF;
END $$;
