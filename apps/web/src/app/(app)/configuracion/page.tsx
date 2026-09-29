import { redirect } from 'next/navigation';
import { can } from '@odontotrust/shared';
import { getContext } from '@/lib/api';
import { ConfigView } from './config-view';

export default async function ConfiguracionPage() {
  const ctx = await getContext();
  // The API enforces this too; here we just avoid showing a screen that would only fail.
  if (!ctx?.rol || !can(ctx.rol, 'agenda:config')) redirect('/');
  return <ConfigView />;
}
