-- RLS + grants for bloqueos, and indexes for agenda range queries.
GRANT SELECT, INSERT, UPDATE ON bloqueos TO app_user;
--> statement-breakpoint
ALTER TABLE bloqueos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bloqueos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON bloqueos FOR ALL TO app_user
  USING (clinica_id = app_clinica_id())
  WITH CHECK (clinica_id = app_clinica_id());
--> statement-breakpoint
CREATE INDEX turnos_clinica_inicio_idx ON turnos (clinica_id, inicio);
--> statement-breakpoint
CREATE INDEX bloqueos_clinica_inicio_idx ON bloqueos (clinica_id, inicio);
