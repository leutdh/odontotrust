CREATE TABLE "bloqueos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"profesional_id" uuid,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"motivo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "bloqueos_clinica_id_uk" UNIQUE("clinica_id","id"),
	CONSTRAINT "bloqueos_fin_ck" CHECK ("bloqueos"."fin" > "bloqueos"."inicio")
);
--> statement-breakpoint
ALTER TABLE "bloqueos" ADD CONSTRAINT "bloqueos_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueos" ADD CONSTRAINT "bloqueos_profesional_fk" FOREIGN KEY ("clinica_id","profesional_id") REFERENCES "public"."profesionales"("clinica_id","id") ON DELETE no action ON UPDATE no action;