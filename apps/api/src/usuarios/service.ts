import type { Database } from '@odontotrust/db';
import type { InvitacionDto, UsuarioActualizar, UsuarioDto, UsuarioInvitar } from '@odontotrust/shared';
import type { AuthContext } from '../api/auth';
import { HttpError } from '../api/errors';
import { conflict, notFound, pgCode } from '../api/http';
import { audit } from '../audit';
import type { Tx } from '../db-types';
import * as recordatorios from '../recordatorios/repository';
import type { AuthAdmin, EmailSender } from './ports';
import * as repo from './repository';

export type UsuariosDeps = {
  database: Database;
  /** null when SUPABASE_SERVICE_ROLE_KEY is not configured: user management is then unavailable. */
  authAdmin: AuthAdmin | null;
  email: EmailSender;
  /** Public URL of the web app: invite links point at it. */
  webUrl: string;
};

const yaEsMiembro = () => conflict('ya_es_miembro', 'Ese email ya pertenece a esta clínica');
const ultimoAdmin = () => conflict('ultimo_admin', 'La clínica necesita al menos un administrador activo');

function inviteLink(webUrl: string, tokenHash: string, type: 'invite' | 'recovery') {
  return `${webUrl.replace(/\/$/, '')}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;
}

function toDto(row: repo.MembresiaRow, ctx: AuthContext, extra: { email?: string | null; pendiente?: boolean | null } = {}): UsuarioDto {
  return {
    id: row.id,
    email: row.email ?? extra.email ?? null,
    nombre: row.nombre,
    rol: row.rol as UsuarioDto['rol'],
    activo: row.activo,
    esYo: row.userId === ctx.userId,
    pendiente: extra.pendiente ?? null,
  };
}

export function createUsuariosService({ database, authAdmin, email, webUrl }: UsuariosDeps) {
  const inTenant = <T>(ctx: AuthContext, fn: (tx: Tx) => Promise<T>) =>
    database.withTenant(ctx.clinicaId, fn, ctx.userId);

  function requireAuthAdmin(): AuthAdmin {
    if (!authAdmin) throw new HttpError(503, 'no_configurado', 'La gestión de usuarios no está configurada en el servidor');
    return authAdmin;
  }

  async function sendInviteEmail(ctx: AuthContext, to: string, nombre: string | null, link: string): Promise<boolean> {
    if (!email.configured) return false;
    const clinica = await inTenant(ctx, (tx) => recordatorios.getClinica(tx, ctx.clinicaId));
    const saludo = nombre ? `Hola ${nombre},` : 'Hola,';
    return email.send({
      to,
      subject: `Te invitaron a ${clinica?.nombre ?? 'OdontoTrust'}`,
      text: `${saludo}\n\nTe invitaron a ${clinica?.nombre ?? 'una clínica'} en OdontoTrust. Entrá con este link para elegir tu contraseña:\n\n${link}\n\nSi no esperabas este mensaje, ignoralo.`,
    });
  }

  return {
    async list(ctx: AuthContext): Promise<UsuarioDto[]> {
      const rows = await inTenant(ctx, (tx) => repo.list(tx, ctx.clinicaId));
      // Auth lookups fill the email of older rows and tell whether the invite was ever used.
      return Promise.all(
        rows.map(async (row) => {
          const info = authAdmin ? await authAdmin.getUser(row.userId).catch(() => null) : null;
          return toDto(row, ctx, { email: info?.email, pendiente: info ? !info.signedInBefore : null });
        }),
      );
    },

    async invitar(ctx: AuthContext, input: UsuarioInvitar): Promise<InvitacionDto> {
      const auth = requireAuthAdmin();
      if (await inTenant(ctx, (tx) => repo.findByEmail(tx, ctx.clinicaId, input.email))) throw yaEsMiembro();

      const invited = await auth.invite(input.email);
      const nombre = input.nombre ?? null;

      let row: repo.MembresiaRow;
      try {
        row = await inTenant(ctx, async (tx) => {
          if (await repo.findByUser(tx, ctx.clinicaId, invited.userId)) throw yaEsMiembro();
          const created = await repo.insert(tx, ctx.clinicaId, {
            userId: invited.userId,
            rol: input.rol,
            email: input.email,
            nombre,
          });

          if (input.rol === 'profesional') {
            if (input.profesionalId) {
              const prof = await repo.getProfesional(tx, ctx.clinicaId, input.profesionalId);
              if (!prof) throw new HttpError(400, 'referencia_invalida', 'Profesional no encontrado');
              if (prof.membresiaId) throw conflict('profesional_ya_vinculado', 'Ese profesional ya tiene un usuario');
              await repo.linkProfesional(tx, ctx.clinicaId, prof.id, created.id);
            } else {
              await repo.createProfesional(tx, ctx.clinicaId, nombre ?? input.email, created.id);
            }
          }
          await audit(tx, ctx, { entidad: 'membresias', entidadId: created.id, accion: 'create', metadata: { rol: input.rol } });
          return created;
        });
      } catch (e) {
        if (pgCode(e) === '23505') throw yaEsMiembro(); // concurrent invite of the same email
        throw e;
      }

      const link = invited.existed ? null : inviteLink(webUrl, invited.hashedToken, 'invite');
      const enviadoPorEmail = link ? await sendInviteEmail(ctx, input.email, nombre, link) : false;
      return {
        usuario: toDto(row, ctx, { pendiente: !invited.existed }),
        invitacion: { link, enviadoPorEmail, cuentaExistente: invited.existed },
      };
    },

    actualizar(ctx: AuthContext, id: string, input: UsuarioActualizar): Promise<UsuarioDto> {
      return inTenant(ctx, async (tx) => {
        const row = await repo.getById(tx, ctx.clinicaId, id);
        if (!row) throw notFound('Usuario');

        const stopsBeingAdmin =
          row.rol === 'admin' && row.activo && ((input.rol && input.rol !== 'admin') || input.activo === false);
        if (stopsBeingAdmin) {
          const admins = await repo.lockActiveAdmins(tx, ctx.clinicaId);
          if (admins.length <= 1) throw ultimoAdmin();
        }

        const updated = await repo.update(tx, ctx.clinicaId, id, {
          ...(input.rol !== undefined && { rol: input.rol }),
          ...(input.activo !== undefined && { activo: input.activo }),
          ...(input.nombre !== undefined && { nombre: input.nombre }),
        });

        // A user who becomes a professional needs an agenda column.
        if (input.rol === 'profesional' && !(await repo.linkedProfesional(tx, ctx.clinicaId, id))) {
          await repo.createProfesional(tx, ctx.clinicaId, updated.nombre ?? updated.email ?? 'Profesional', id);
        }

        await audit(tx, ctx, {
          entidad: 'membresias',
          entidadId: id,
          accion: 'update',
          metadata: { campos: Object.keys(input), ...(input.rol && { rol: input.rol }), ...(input.activo !== undefined && { activo: input.activo }) },
        });
        return toDto(updated, ctx);
      });
    },

    /**
     * New link for someone who never signed in. Refused for accounts that already used their
     * invite: otherwise a clinic admin could take over an account that also belongs to other clinics.
     */
    async reenviarInvitacion(ctx: AuthContext, id: string): Promise<InvitacionDto> {
      const auth = requireAuthAdmin();
      const row = await inTenant(ctx, (tx) => repo.getById(tx, ctx.clinicaId, id));
      if (!row) throw notFound('Usuario');

      const info = await auth.getUser(row.userId);
      if (!info) throw notFound('Usuario');
      if (info.signedInBefore) throw conflict('cuenta_activa', 'Este usuario ya ingresó: no se puede generar un link nuevo');
      const to = row.email ?? info.email;
      if (!to) throw new HttpError(400, 'sin_email', 'El usuario no tiene email');

      const link = inviteLink(webUrl, await auth.recoveryToken(to), 'recovery');
      await inTenant(ctx, (tx) =>
        audit(tx, ctx, { entidad: 'membresias', entidadId: id, accion: 'update', metadata: { campos: ['invitacion'] } }),
      );
      const enviadoPorEmail = await sendInviteEmail(ctx, to, row.nombre, link);
      return { usuario: toDto(row, ctx, { email: to, pendiente: true }), invitacion: { link, enviadoPorEmail, cuentaExistente: false } };
    },
  };
}
