'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ROLES, type InvitacionDto, type Rol, type UsuarioDto } from '@odontotrust/shared';
import { btnGhost, btnPrimary, inputClass } from '@/components/ui';
import { ApiError, api } from '@/lib/api-client';

const ROL_LABEL: Record<Rol, string> = { admin: 'Administrador', profesional: 'Profesional', recepcion: 'Recepción' };

function InvitacionPanel({ data, onClose }: { data: InvitacionDto; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const { link, enviadoPorEmail, cuentaExistente } = data.invitacion;
  return (
    <div role="status" className="flex flex-col gap-2 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
      {cuentaExistente ? (
        <p>
          <strong>{data.usuario.email}</strong> ya tenía cuenta: ya puede entrar a esta clínica con su contraseña de siempre.
        </p>
      ) : (
        <>
          <p>
            Invitación creada para <strong>{data.usuario.email}</strong>.{' '}
            {enviadoPorEmail
              ? 'Se le envió por email. También podés copiar el link:'
              : 'No se envió por email: copiá el link y mandáselo (por ejemplo, por WhatsApp).'}
          </p>
          <div className="flex gap-2">
            <input readOnly value={link ?? ''} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} text-xs`} aria-label="Link de invitación" />
            <button
              className={btnGhost}
              onClick={async () => {
                if (link) await navigator.clipboard?.writeText(link).catch(() => {});
                setCopied(true);
              }}
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs opacity-80">Sirve una sola vez. Cuando la persona lo use, elige su contraseña y queda adentro.</p>
        </>
      )}
      <button className="self-start text-xs underline" onClick={onClose}>
        Cerrar
      </button>
    </div>
  );
}

function InviteForm({ onDone }: { onDone: (r: InvitacionDto) => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Rol>('recepcion');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await api<InvitacionDto>('/usuarios/invitar', { method: 'POST', body: { email, rol, nombre } });
      setEmail('');
      setNombre('');
      onDone(r);
      await qc.invalidateQueries({ queryKey: ['usuarios'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo invitar. Reintentá.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="font-medium">Invitar a alguien</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Rol
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} className={inputClass}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROL_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Nombre {rol === 'profesional' ? '(aparece en la agenda) *' : '(opcional)'}
          <input required={rol === 'profesional'} value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} autoComplete="off" />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button disabled={pending} className={`${btnPrimary} self-start`}>
        {pending ? 'Invitando…' : 'Invitar'}
      </button>
    </form>
  );
}

function UsuarioRow({ u, onInvitacion }: { u: UsuarioDto; onInvitacion: (r: InvitacionDto) => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['usuarios'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo completar. Reintentá.');
    } finally {
      setPending(false);
    }
  }
  const patch = (body: object) => run(() => api(`/usuarios/${u.id}`, { method: 'PATCH', body }));

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={u.activo ? '' : 'text-neutral-400'}>
          <p className="font-medium">
            {u.nombre ?? u.email ?? 'Sin nombre'}
            {u.esYo && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">Vos</span>}
            {u.pendiente && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Pendiente</span>}
            {!u.activo && <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700">Inactivo</span>}
          </p>
          {u.nombre && u.email && <p className="text-sm text-neutral-500">{u.email}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Rol de ${u.nombre ?? u.email ?? 'usuario'}`}
            value={u.rol}
            disabled={pending || u.esYo}
            onChange={(e) => patch({ rol: e.target.value })}
            className={`${inputClass} w-auto py-1.5 text-sm`}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROL_LABEL[r]}
              </option>
            ))}
          </select>
          {u.pendiente && (
            <button
              className={`${btnGhost} px-3 py-1.5 text-sm`}
              disabled={pending}
              onClick={() => run(async () => onInvitacion(await api<InvitacionDto>(`/usuarios/${u.id}/reenviar-invitacion`, { method: 'POST' })))}
            >
              Nuevo link
            </button>
          )}
          {!u.esYo && (
            <button className={`${btnGhost} px-3 py-1.5 text-sm`} disabled={pending} onClick={() => patch({ activo: !u.activo })}>
              {u.activo ? 'Desactivar' : 'Activar'}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </li>
  );
}

export function UsuariosView() {
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => api<UsuarioDto[]>('/usuarios') });
  const [invitacion, setInvitacion] = useState<InvitacionDto | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <p className="text-sm text-neutral-500">Quién puede entrar a la clínica y con qué rol. Siempre tiene que haber al menos un administrador activo.</p>
      </div>

      {invitacion && <InvitacionPanel data={invitacion} onClose={() => setInvitacion(null)} />}
      <InviteForm onDone={setInvitacion} />

      {usuarios.isError && (
        <p role="alert" className="text-sm text-red-600">
          {usuarios.error instanceof ApiError && usuarios.error.status === 503
            ? 'La gestión de usuarios no está configurada en el servidor (falta la clave de servicio de Supabase).'
            : 'No se pudo cargar la lista.'}
        </p>
      )}
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {(usuarios.data ?? []).map((u) => (
          <UsuarioRow key={u.id} u={u} onInvitacion={setInvitacion} />
        ))}
        {usuarios.isPending && <li className="px-4 py-3 text-neutral-500">Cargando…</li>}
      </ul>
    </div>
  );
}
