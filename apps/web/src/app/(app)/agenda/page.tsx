import { redirect } from 'next/navigation';
import { DEFAULT_TIME_ZONE } from '@odontotrust/shared';
import { apiFetch, getContext } from '@/lib/api';
import { AgendaView } from './agenda-view';

export default async function AgendaPage() {
  const ctx = await getContext();
  if (!ctx?.clinicaId) redirect('/');
  const res = await apiFetch('/clinica', {}, ctx.clinicaId);
  const clinica = res?.ok ? ((await res.json()) as { zonaHoraria: string }) : null;
  return <AgendaView tz={clinica?.zonaHoraria ?? DEFAULT_TIME_ZONE} />;
}
