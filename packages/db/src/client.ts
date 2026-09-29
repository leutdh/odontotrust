import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreateDbOptions = {
  url: string;
  /**
   * Tests only: connect with an admin URL and `SET LOCAL ROLE` to this role inside each
   * transaction, so RLS is exercised without needing the role's password.
   * Production connects directly as `app_user` and leaves this unset.
   */
  assumeRole?: 'app_user';
  max?: number;
};

export function createDb({ url, assumeRole, max = 10 }: CreateDbOptions) {
  // Transaction-mode pooler: no prepared statements, and never session-level SET.
  const client = postgres(url, { max, prepare: false });
  const db = drizzle(client, { schema });
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  async function scoped<T>(settings: Record<string, string>, fn: (tx: Tx) => Promise<T>) {
    return db.transaction(async (tx) => {
      if (assumeRole) await tx.execute(sql.raw(`set local role ${assumeRole}`));
      for (const [key, value] of Object.entries(settings)) {
        // is_local = true: equivalent to SET LOCAL, scoped to this transaction.
        await tx.execute(sql`select set_config(${key}, ${value}, true)`);
      }
      return fn(tx);
    });
  }

  return {
    db,
    /** The only way services touch tenant data: RLS sees `app.clinica_id` for this transaction. */
    withTenant<T>(clinicaId: string, fn: (tx: Tx) => Promise<T>, userId?: string) {
      if (!UUID_RE.test(clinicaId)) throw new Error('withTenant: invalid clinicaId');
      return scoped({ 'app.clinica_id': clinicaId, ...(userId ? { 'app.user_id': userId } : {}) }, fn);
    },
    /** Cross-tenant reads of the caller's own memberships/clinics (clinic selector, auth). */
    withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>) {
      if (!UUID_RE.test(userId)) throw new Error('withUser: invalid userId');
      return scoped({ 'app.user_id': userId }, fn);
    },
    /** Fails if the connection role can bypass RLS (e.g. `postgres`): the API must run as app_user. */
    async assertRlsEnforced() {
      const rows = await db.execute(
        sql`select rolsuper or rolbypassrls as bypass, current_user as name from pg_roles where rolname = current_user`,
      );
      const row = rows[0] as { bypass: boolean; name: string } | undefined;
      if (!row || row.bypass) {
        throw new Error(
          `DATABASE_URL connects as "${row?.name}", which bypasses RLS. Use the app_user role (see PLAN.md 4.1).`,
        );
      }
    },
    close: () => client.end(),
  };
}

export type Database = ReturnType<typeof createDb>;
