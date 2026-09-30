import type { EmailSender } from './ports';

/** Used until an email provider is configured: the admin copies the link instead. */
export const noEmailSender: EmailSender = {
  configured: false,
  async send() {
    return false;
  },
};

/** Resend (https://resend.com) over plain HTTPS: no SDK needed. */
export function createResendSender(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): EmailSender {
  return {
    configured: true,
    async send({ to, subject, text }) {
      try {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, text }),
        });
        return res.ok;
      } catch {
        // Never log the recipient or body: they contain personal data and a login link.
        return false;
      }
    },
  };
}
