// Ports for the two external services user management needs. Services depend on these interfaces,
// so tests inject fakes and nothing real (Supabase Auth, Resend) is contacted.

export type InviteResult =
  | { existed: false; userId: string; hashedToken: string }
  | { existed: true; userId: string };

export type AuthUserInfo = { id: string; email: string | null; signedInBefore: boolean };

export interface AuthAdmin {
  /**
   * Creates the auth user (if the email is new) and a one-time invite token, or reports that the
   * account already exists (in which case NO token is produced: see `regenerateLink`).
   */
  invite(email: string): Promise<InviteResult>;
  /** New one-time token for an existing user (`recovery` type). */
  recoveryToken(email: string): Promise<string>;
  getUser(userId: string): Promise<AuthUserInfo | null>;
}

export interface EmailSender {
  readonly configured: boolean;
  /** Returns true if the provider accepted the message. Never throws. */
  send(msg: { to: string; subject: string; text: string }): Promise<boolean>;
}
