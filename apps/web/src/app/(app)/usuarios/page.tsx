import { redirect } from 'next/navigation';
import { can } from '@odontotrust/shared';
import { getContext } from '@/lib/api';
import { UsuariosView } from './usuarios-view';

export default async function UsuariosPage() {
  const ctx = await getContext();
  // The API enforces this too; here we just avoid showing a screen that would only fail.
  if (!ctx?.rol || !can(ctx.rol, 'usuarios:manage')) redirect('/');
  return <UsuariosView />;
}
