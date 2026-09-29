-- Custom migration: app role, RLS policies, grants and anti-overlap constraints.
-- Tenant isolation: every request runs in a transaction that calls
--   select set_config('app.clinica_id', <uuid>, true)
-- and policies compare clinica_id against it. Empty/unset setting => NULL => no rows.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint

-- Lets the admin/migration role SET ROLE app_user (used by isolation tests).
GRANT app_user TO CURRENT_USER;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_clinica_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.clinica_id', true), '')::uuid $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

-- Nobody but app_user (and the owner) touches business tables.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint

-- No DELETE grants: soft delete only (deleted_at). Clinical data is never physically deleted.
GRANT SELECT, INSERT, UPDATE ON
  clinicas, membresias, profesionales, sedes, sillones, pacientes, tipos_tratamiento, turnos
  TO app_user;
--> statement-breakpoint

-- audit_log is append-only.
GRANT SELECT, INSERT ON audit_log TO app_user;
--> statement-breakpoint

-- Standard tenant policy on every table that carries clinica_id.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'membresias', 'profesionales', 'sedes', 'sillones',
    'pacientes', 'tipos_tratamiento', 'turnos', 'audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO app_user
         USING (clinica_id = app_clinica_id())
         WITH CHECK (clinica_id = app_clinica_id())', t);
  END LOOP;
END
$$;
--> statement-breakpoint

-- A user can read their own memberships across clinics (clinic selector).
CREATE POLICY membresias_self_select ON membresias FOR SELECT TO app_user
  USING (user_id = app_user_id());
--> statement-breakpoint

-- clinicas: its id IS the tenant.
ALTER TABLE clinicas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE clinicas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY clinicas_select ON clinicas FOR SELECT TO app_user
  USING (
    id = app_clinica_id()
    OR id IN (SELECT clinica_id FROM membresias WHERE user_id = app_user_id() AND activo)
  );
--> statement-breakpoint
CREATE POLICY clinicas_update ON clinicas FOR UPDATE TO app_user
  USING (id = app_clinica_id()) WITH CHECK (id = app_clinica_id());
--> statement-breakpoint

-- Anti-overlap (Fase 3 relies on these; concurrent inserts are serialized by the index).
ALTER TABLE turnos ADD CONSTRAINT turnos_no_overlap_profesional
  EXCLUDE USING gist (
    clinica_id WITH =,
    profesional_id WITH =,
    tstzrange(inicio, fin) WITH &&
  ) WHERE (estado <> 'cancelado' AND deleted_at IS NULL);
--> statement-breakpoint
ALTER TABLE turnos ADD CONSTRAINT turnos_no_overlap_sillon
  EXCLUDE USING gist (
    clinica_id WITH =,
    sillon_id WITH =,
    tstzrange(inicio, fin) WITH &&
  ) WHERE (sillon_id IS NOT NULL AND estado <> 'cancelado' AND deleted_at IS NULL);
--> statement-breakpoint

-- Patient DNI unique per clinic among live records.
CREATE UNIQUE INDEX pacientes_clinica_dni_uk ON pacientes (clinica_id, dni)
  WHERE dni IS NOT NULL AND deleted_at IS NULL;
