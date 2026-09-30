import { boolean, check, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clinicaId, id, timestamps } from './_common';
import { clinicas } from './clinicas';

export const membresias = pgTable(
  'membresias',
  {
    id: id(),
    clinicaId: clinicaId().references(() => clinicas.id),
    // Supabase Auth user id. No FK: the auth schema is Supabase-managed.
    userId: uuid('user_id').notNull(),
    rol: text('rol').notNull(),
    activo: boolean('activo').notNull().default(true),
    // Staff contact/display data, kept here so listing users needs no call to Supabase Auth.
    // Nullable: rows created before this column exist (the API falls back to Auth for them).
    email: text('email'),
    nombre: text('nombre'),
    ...timestamps(),
  },
  (t) => [
    unique('membresias_clinica_user_uk').on(t.clinicaId, t.userId),
    unique('membresias_clinica_id_uk').on(t.clinicaId, t.id),
    check('membresias_rol_ck', sql`${t.rol} in ('admin','profesional','recepcion')`),
  ],
);
