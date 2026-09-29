import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

export const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
export const clinicaId = () => uuid('clinica_id').notNull();
export const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const deletedAt = () => timestamp('deleted_at', { withTimezone: true });
