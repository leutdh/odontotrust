import { describe, expect, it, vi } from 'vitest';
import { createResendSender, noEmailSender } from './email';

const msg = { to: 'a@x.test', subject: 'Asunto', text: 'Cuerpo con link' };

describe('email senders', () => {
  it('noEmailSender is not configured and never sends', async () => {
    expect(noEmailSender.configured).toBe(false);
    expect(await noEmailSender.send(msg)).toBe(false);
  });

  it('Resend: posts the message with the API key and reports success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const sender = createResendSender('re_key', 'OdontoTrust <no-reply@x.test>', fetchMock as unknown as typeof fetch);
    expect(sender.configured).toBe(true);
    expect(await sender.send(msg)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body)).toEqual({ from: 'OdontoTrust <no-reply@x.test>', to: ['a@x.test'], subject: 'Asunto', text: 'Cuerpo con link' });
  });

  it('Resend: a rejected or failing request returns false and never throws', async () => {
    const rejected = createResendSender('k', 'f@x.test', vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch);
    expect(await rejected.send(msg)).toBe(false);
    const broken = createResendSender('k', 'f@x.test', vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch);
    expect(await broken.send(msg)).toBe(false);
  });
});
