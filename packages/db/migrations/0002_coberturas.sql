CREATE TABLE "coberturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"obra_social" text NOT NULL,
	"plan" text,
	"nro_afiliado" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "coberturas_clinica_paciente_uk" UNIQUE("clinica_id","paciente_id")
);
--> statement-breakpoint
ALTER TABLE "coberturas" ADD CONSTRAINT "coberturas_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coberturas" ADD CONSTRAINT "coberturas_paciente_fk" FOREIGN KEY ("clinica_id","paciente_id") REFERENCES "public"."pacientes"("clinica_id","id") ON DELETE no action ON UPDATE no action;