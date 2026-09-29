-- RLS + grants for recordatorios. No DELETE: the send log is never physically removed.
GRANT SELECT, INSERT, UPDATE ON recordatorios TO app_user;
--> statement-breakpoint
ALTER TABLE recordatorios ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE recordatorios FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON recordatorios FOR ALL TO app_user
  USING (clinica_id = app_clinica_id())
  WITH CHECK (clinica_id = app_clinica_id());
--> statement-breakpoint
CREATE INDEX recordatorios_clinica_turno_idx ON recordatorios (clinica_id, turno_id);
