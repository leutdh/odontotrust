-- RLS + grants for coberturas (same tenant policy as the other business tables).
GRANT SELECT, INSERT, UPDATE ON coberturas TO app_user;
--> statement-breakpoint
ALTER TABLE coberturas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE coberturas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON coberturas FOR ALL TO app_user
  USING (clinica_id = app_clinica_id())
  WITH CHECK (clinica_id = app_clinica_id());
