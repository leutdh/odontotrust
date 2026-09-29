CREATE TABLE "recordatorios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	"canal" text NOT NULL,
	"estado" text NOT NULL,
	"enviado_at" timestamp with time zone,
	"error" text,
	"idempotency_key" text,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recordatorios_clinica_idem_uk" UNIQUE("clinica_id","idempotency_key"),
	CONSTRAINT "recordatorios_canal_ck" CHECK ("recordatorios"."canal" in ('whatsapp_link','whatsapp_api')),
	CONSTRAINT "recordatorios_estado_ck" CHECK ("recordatorios"."estado" in ('abierto','pendiente','enviado','entregado','leido','fallido'))
);
--> statement-breakpoint
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_turno_fk" FOREIGN KEY ("clinica_id","turno_id") REFERENCES "public"."turnos"("clinica_id","id") ON DELETE no action ON UPDATE no action;