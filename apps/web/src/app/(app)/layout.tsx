import Link from 'next/link';
import type { ReactNode } from 'react';
import { logout } from '../actions';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <nav className="mx-auto flex h-14 max-w-3xl items-center gap-5 px-4">
          <Link href="/" className="font-semibold">
            OdontoTrust
          </Link>
          <Link href="/pacientes" className="text-neutral-700 dark:text-neutral-300">
            Pacientes
          </Link>
          <form action={logout} className="ml-auto">
            <button className="text-sm text-neutral-500">Salir</button>
          </form>
        </nav>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">{children}</div>
    </div>
  );
}
