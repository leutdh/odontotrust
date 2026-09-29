CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid,
	"accion" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinicas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"cuit" text,
	"zona_horaria" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"configuracion" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "membresias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rol" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membresias_clinica_user_uk" UNIQUE("clinica_id","user_id"),
	CONSTRAINT "membresias_clinica_id_uk" UNIQUE("clinica_id","id"),
	CONSTRAINT "membresias_rol_ck" CHECK ("membresias"."rol" in ('admin','profesional','recepcion'))
);
--> statement-breakpoint
CREATE TABLE "pacientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"dni" text,
	"fecha_nacimiento" date,
	"celular" text,
	"email" text,
	"domicilio" text,
	"antecedentes" text,
	"alergias" text,
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "pacientes_clinica_id_uk" UNIQUE("clinica_id","id")
);
--> statement-breakpoint
CREATE TABLE "profesionales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"membresia_id" uuid,
	"nombre" text NOT NULL,
	"matricula" text,
	"especialidad" text,
	"color" text,
	"horarios" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "profesionales_clinica_id_uk" UNIQUE("clinica_id","id")
);
--> statement-breakpoint
CREATE TABLE "sedes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sedes_clinica_id_uk" UNIQUE("clinica_id","id")
);
--> statement-breakpoint
CREATE TABLE "sillones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"sede_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sillones_clinica_id_uk" UNIQUE("clinica_id","id")
);
--> statement-breakpoint
CREATE TABLE "tipos_tratamiento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"duracion_minutos" integer NOT NULL,
	"precio_base_centavos" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tipos_tratamiento_clinica_id_uk" UNIQUE("clinica_id","id"),
	CONSTRAINT "tipos_tratamiento_duracion_ck" CHECK ("tipos_tratamiento"."duracion_minutos" > 0)
);
--> statement-breakpoint
CREATE TABLE "turnos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"profesional_id" uuid NOT NULL,
	"sillon_id" uuid,
	"tipo_tratamiento_id" uuid,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "turnos_clinica_id_uk" UNIQUE("clinica_id","id"),
	CONSTRAINT "turnos_fin_ck" CHECK ("turnos"."fin" > "turnos"."inicio"),
	CONSTRAINT "turnos_estado_ck" CHECK ("turnos"."estado" in ('pendiente','confirmado','atendido','ausente','cancelado'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profesionales" ADD CONSTRAINT "profesionales_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profesionales" ADD CONSTRAINT "profesionales_membresia_fk" FOREIGN KEY ("clinica_id","membresia_id") REFERENCES "public"."membresias"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sedes" ADD CONSTRAINT "sedes_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sillones" ADD CONSTRAINT "sillones_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sillones" ADD CONSTRAINT "sillones_sede_fk" FOREIGN KEY ("clinica_id","sede_id") REFERENCES "public"."sedes"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_tratamiento" ADD CONSTRAINT "tipos_tratamiento_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_paciente_fk" FOREIGN KEY ("clinica_id","paciente_id") REFERENCES "public"."pacientes"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_profesional_fk" FOREIGN KEY ("clinica_id","profesional_id") REFERENCES "public"."profesionales"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_sillon_fk" FOREIGN KEY ("clinica_id","sillon_id") REFERENCES "public"."sillones"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_tipo_tratamiento_fk" FOREIGN KEY ("clinica_id","tipo_tratamiento_id") REFERENCES "public"."tipos_tratamiento"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_clinica_ts_idx" ON "audit_log" USING btree ("clinica_id","timestamp");