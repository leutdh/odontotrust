import Link from 'next/link';
import type { ReactNode } from 'react';
import { can } from '@odontotrust/shared';
import { getContext } from '@/lib/api';
import { logout } from '../actions';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getContext();
  const link = 'text-neutral-700 dark:text-neutral-300';
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <nav className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-4">
          <Link href="/" className="font-semibold">
            OdontoTrust
          </Link>
          <Link href="/agenda" className={link}>
            Agenda
          </Link>
          <Link href="/pacientes" className={link}>
            Pacientes
          </Link>
          {ctx?.rol && can(ctx.rol, 'agenda:config') && (
            <Link href="/configuracion" className={link}>
              Configuración
            </Link>
          )}
          <form action={logout} className="ml-auto">
            <button className="text-sm text-neutral-500">Salir</button>
          </form>
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
