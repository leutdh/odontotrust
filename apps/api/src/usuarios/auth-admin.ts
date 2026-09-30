import { createClient } from '@supabase/supabase-js';
import type { AuthAdmin, AuthUserInfo, InviteResult } from './ports';

const MAX_LOOKUP_PAGES = 20; // 20 x 200 = 4000 accounts; enough for the early stage

/** Supabase Auth adapter. Uses the service role key: it must only ever run on the backend. */
export function createSupabaseAuthAdmin(supabaseUrl: string, serviceRoleKey: string): AuthAdmin {
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = client.auth.admin;

  // Supabase has no "get user by email": scan the pages (fine at this scale).
  async function findByEmail(email: string) {
    for (let page = 1; page <= MAX_LOOKUP_PAGES; page++) {
      const { data, error } = await admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error('auth_lookup_failed');
      const found = data.users.find((u) => u.email?.toLowerCase() === email);
      if (found) return found;
      if (data.users.length < 200) break;
    }
    return null;
  }

  return {
    async invite(email): Promise<InviteResult> {
      const { data, error } = await admin.generateLink({ type: 'invite', email });
      if (!error && data.user && data.properties?.hashed_token) {
        return { existed: false, userId: data.user.id, hashedToken: data.properties.hashed_token };
      }
      // Already registered (possibly in another clinic): reuse the account, produce no link.
      if (error && /already|exists|registered/i.test(`${error.code ?? ''} ${error.message}`)) {
        const existing = await findByEmail(email);
        if (existing) return { existed: true, userId: existing.id };
      }
      throw new Error('auth_invite_failed');
    },

    async recoveryToken(email) {
      const { data, error } = await admin.generateLink({ type: 'recovery', email });
      if (error || !data.properties?.hashed_token) throw new Error('auth_recovery_failed');
      return data.properties.hashed_token;
    },

    async getUser(userId): Promise<AuthUserInfo | null> {
      const { data, error } = await admin.getUserById(userId);
      if (error || !data.user) return null;
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        signedInBefore: Boolean(data.user.last_sign_in_at),
      };
    },
  };
}
