'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { btnDanger } from '@/components/ui';

export function DeleteButton({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!window.confirm(`¿Eliminar a ${nombre}? Se conserva en el sistema pero deja de aparecer.`)) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/proxy/pacientes/${id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) {
      router.push('/pacientes');
      router.refresh();
      return;
    }
    setError('No se pudo eliminar. Reintentá.');
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={onClick} disabled={pending} className={btnDanger}>
        {pending ? 'Eliminando…' : 'Eliminar paciente'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
