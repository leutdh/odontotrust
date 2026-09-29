'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Page, PacienteListItem } from '@odontotrust/shared';
import { btnGhost, inputClass } from '@/components/ui';

class Unauthorized extends Error {}

async function fetchPage(q: string, cursor: string | null): Promise<Page<PacienteListItem>> {
  const params = new URLSearchParams({ limit: '20' });
  if (q) params.set('q', q);
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/proxy/pacientes?${params}`);
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error('No se pudo cargar la lista');
  return res.json();
}

export function PacientesList() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);

  const query = useInfiniteQuery({
    queryKey: ['pacientes', q],
    queryFn: ({ pageParam }) => fetchPage(q, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  // Expired session: back to login.
  useEffect(() => {
    if (query.error instanceof Unauthorized) router.push('/login');
  }, [query.error, router]);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <input
          autoFocus
          type="search"
          inputMode="search"
          placeholder="Nombre, apellido, DNI o teléfono"
          aria-label="Buscar paciente"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className={inputClass}
        />
        <Link href="/pacientes/nuevo" className={`${btnGhost} shrink-0`}>
          Nuevo
        </Link>
      </div>

      {query.isError && (
        <p role="alert" className="text-sm text-red-600">
          No se pudo cargar la lista. Reintentá en unos segundos.
        </p>
      )}

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/pacientes/${p.id}`} className="flex flex-col gap-0.5 px-4 py-3 active:bg-neutral-100 dark:active:bg-neutral-900">
              <span className="font-medium">
                {p.apellido}, {p.nombre}
              </span>
              <span className="text-sm text-neutral-500">
                {[p.dni && `DNI ${p.dni}`, p.celular].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
              </span>
            </Link>
          </li>
        ))}
        {!query.isPending && items.length === 0 && (
          <li className="px-4 py-6 text-center text-neutral-500">
            {q ? 'No se encontraron pacientes.' : 'Todavía no hay pacientes cargados.'}
          </li>
        )}
        {query.isPending && <li className="px-4 py-6 text-center text-neutral-500">Cargando…</li>}
      </ul>

      {query.hasNextPage && (
        <button className={btnGhost} onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
        </button>
      )}
    </div>
  );
}
