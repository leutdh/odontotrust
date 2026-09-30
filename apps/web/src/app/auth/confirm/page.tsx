import { btnPrimary } from '@/components/ui';
import { confirmarLink } from '../../actions';

// Opening this page (or previewing it) consumes nothing: the token is only used when the button
// below is pressed. See `confirmarLink`.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  const valid = Boolean(tokenHash) && (type === 'invite' || type === 'recovery');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">{type === 'recovery' ? 'Restablecer contraseña' : 'Te invitaron a OdontoTrust'}</h1>
      {valid ? (
        <form action={confirmarLink} className="flex flex-col gap-4">
          <p className="text-neutral-600 dark:text-neutral-400">Continuá para elegir tu contraseña y entrar.</p>
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <button className={btnPrimary}>Continuar</button>
        </form>
      ) : (
        <p role="alert" className="text-red-600">
          El link no es válido. Pedile a un administrador que te genere uno nuevo.
        </p>
      )}
    </main>
  );
}
